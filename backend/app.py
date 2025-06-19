import os
import re
import frontmatter
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
import unicodedata # For robust ID generation

app = Flask(__name__)
CORS(app)

# --- Helper for ID generation ---
def generate_safe_id(text):
    if not text:
        return None
    # Normalize, lower, replace spaces/special chars
    text = unicodedata.normalize('NFKD', str(text)).encode('ascii', 'ignore').decode('ascii')
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '-c', text).strip('-')
    return text if text else None


# --- Duration Parsing and Tiering ---
def get_duration_tier(hours):
    if hours is None:
        return "未知时长"
    if hours < 0: # Handle potential bad data
        return "未知时长"
    if hours < 5: return "超短篇"
    if hours < 10: return "短篇"
    if hours < 30: return "中篇"
    if hours < 50: return "长篇"
    return "超长篇"

def parse_duration_to_hours(duration_str):
    if not duration_str or not isinstance(duration_str, str):
        return None
    match = re.search(r'([\d.]+)\s*h', duration_str, re.IGNORECASE)
    if match:
        try:
            val = float(match.group(1))
            return val if val >= 0 else None # Ensure non-negative
        except ValueError:
            return None
    return None

# --- Markdown Parsing Logic (Enhancements) ---
def parse_markdown_file_content(content_str, initial_data):
    game_data = initial_data.copy()
    game_data.update({
        'cover_image': None,
        'names': {'japanese': None, 'english': None, 'chinese': None, 'aliases': []},
        'info': {
            'duration_str': None, # Store original string
            'duration_hours': None,
            'duration_tier': None,
            'developer': None,
            'release_date': None,
            'platforms': [],
            'related_works': []
        },
        'download_links': [],
        'screenshots': [],
        'description': None,
        'series_name': None, 
        'series_tag': None   
    })

    current_section_title = None
    current_section_lines = []

    def process_collected_section(title, lines_content_list):
        nonlocal game_data
        section_text = "\n".join(lines_content_list).strip()
        if not title: return

        def clean_none_string(value):
            return None if isinstance(value, str) and value.lower() == 'none' else value

        try:
            if title == "游戏封面":
                match = re.search(r'!\[.*?\]\((.*?)\)', section_text)
                if match: game_data['cover_image'] = match.group(1)
            
            elif title == "游戏名称":
                name_lines = section_text.split('\n')
                for line in name_lines:
                    line = line.strip()
                    if line.startswith("- 日文："): game_data['names']['japanese'] = clean_none_string(line.replace("- 日文：", "").strip())
                    elif line.startswith("- 英文："): game_data['names']['english'] = clean_none_string(line.replace("- 英文：", "").strip())
                    elif line.startswith("- 中文："): game_data['names']['chinese'] = clean_none_string(line.replace("- 中文：", "").strip())
                    elif line.startswith("- 别名："):
                        aliases_str = line.replace("- 别名：", "").strip()
                        if aliases_str.lower() != 'none':
                            game_data['names']['aliases'] = [a.strip() for a in aliases_str.split(',') if a.strip()]
            
            elif title == "游戏信息":
                info_lines = section_text.split('\n')
                in_related_works_section = False
                for line in info_lines:
                    line = line.strip()
                    if line.startswith("- 时长："):
                        duration_val_str = clean_none_string(line.replace("- 时长：", "").strip())
                        game_data['info']['duration_str'] = duration_val_str
                        hours = parse_duration_to_hours(duration_val_str)
                        game_data['info']['duration_hours'] = hours
                        game_data['info']['duration_tier'] = get_duration_tier(hours)
                    elif line.startswith("- 开发者："): game_data['info']['developer'] = clean_none_string(line.replace("- 开发者：", "").strip())
                    elif line.startswith("- 发售日期："): 
                        date_str = clean_none_string(str(line.replace("- 发售日期：", "").strip()))
                        if date_str and re.match(r'^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$', date_str):
                             game_data['info']['release_date'] = date_str
                        elif date_str:
                            app.logger.warning(f"Invalid date format '{date_str}' for file {game_data.get('source_filename', 'Unknown')}. Setting to None.")
                            game_data['info']['release_date'] = None
                        else:
                            game_data['info']['release_date'] = None

                    elif line.startswith("- 游戏平台："):
                        platforms_str = line.replace("- 游戏平台：", "").strip()
                        if platforms_str.lower() != 'none':
                            game_data['info']['platforms'] = [p.strip() for p in platforms_str.split(',') if p.strip()]
                    elif line.startswith("- 相关作品："):
                        in_related_works_section = True
                    elif in_related_works_section and line.startswith("- ") and "：" in line:
                        try:
                            work_type_name_part = line.lstrip("- ").strip()
                            work_type, work_name = work_type_name_part.split("：", 1)
                            game_data['info']['related_works'].append({'type': work_type.strip(), 'name': work_name.strip()})
                            if not game_data['series_name'] and ('系列' in work_type or '前作' in work_type or '续作' in work_type):
                                current_title_base = re.sub(r'[\W_]+$', '', game_data.get('title', '').split(' ')[0].lower())
                                related_name_base = re.sub(r'[\W_]+$', '', work_name.split(' ')[0].lower())
                                if current_title_base and related_name_base and len(related_name_base) > 3 and current_title_base.startswith(related_name_base[:4]):
                                    game_data['series_name'] = work_name 
                        except ValueError:
                            app.logger.warning(f"Could not parse related work line: '{line}' in file {game_data.get('source_filename', 'Unknown File')}")
                    elif in_related_works_section and not (line.startswith(" ") or line.startswith("-")):
                        in_related_works_section = False
            
            elif title == "游戏简介":
                description_text = re.sub(r'^\s*\[编辑此页面\].*?\n?', '', section_text, flags=re.MULTILINE).strip()
                game_data['description'] = description_text

            elif title == "下载链接":
                link_lines = section_text.split('\n')
                current_link_object = None
                for line in link_lines:
                    line = line.strip()
                    link_match = re.match(r'-\s*\[(.*?)\]\((.*?)\)', line)
                    if link_match:
                        if current_link_object: 
                            game_data['download_links'].append(current_link_object)
                        current_link_object = {'name': link_match.group(1).strip(), 'url': link_match.group(2).strip(), 'password': None}
                    elif line.startswith("- 解压密码：") and current_link_object:
                        current_link_object['password'] = line.replace("- 解压密码：", "").strip()
                if current_link_object:
                    game_data['download_links'].append(current_link_object)

            elif title == "游戏截图":
                screenshot_matches = re.findall(r'!\[.*?\]\((.*?)\)', section_text)
                game_data['screenshots'].extend(s for s in screenshot_matches if s) 

        except Exception as e:
            app.logger.error(f"Error processing section '{title}' for file {game_data.get('source_filename', 'Unknown File')}: {e}", exc_info=True)

    content_lines = content_str.splitlines()
    for line_idx, line_content in enumerate(content_lines):
        header_match = re.match(r'^##\s+(.*)', line_content)
        if header_match:
            if current_section_title and current_section_lines:
                process_collected_section(current_section_title, current_section_lines)
            current_section_title = header_match.group(1).strip()
            current_section_lines = []
        elif current_section_title:
            if line_content.strip() and not line_content.strip().startswith("[编辑此页面]"):
                current_section_lines.append(line_content)
    
    if current_section_title and current_section_lines:
        process_collected_section(current_section_title, current_section_lines)

    if not game_data['series_name'] and game_data.get('title'):
        title_lower = game_data['title'].lower()
        common_prefixes_tags = {
            "9-nine-": "9-nine-",
            "nekopara": "Nekopara",
            "steins;gate": "Steins;Gate",
        }
        series_found = False
        for prefix, series_display_name in common_prefixes_tags.items():
            if title_lower.startswith(prefix):
                game_data['series_name'] = series_display_name
                remaining_title = title_lower.replace(prefix, "").strip()
                tag_match = re.search(r'(ep\s*\d+|vol\.\s*\d+|\d+|[ivxlcdm]+)$', remaining_title, re.IGNORECASE)
                if tag_match:
                    tag = tag_match.group(1).upper()
                    if not tag.startswith("EP") and tag.isdigit():
                        game_data['series_tag'] = "EP" + tag
                    else:
                        game_data['series_tag'] = tag
                series_found = True
                break
        
        if not series_found:
            match_series_ep = re.match(r'^(.*?)(?:[\s:-]+(?:ep|episode|vol|volume)[\s#.]*([a-z0-9]+)|[\s:-]+([ivxlcdm]+)|ภาค\s*(\d+))', title_lower, re.IGNORECASE)
            if match_series_ep:
                game_data['series_name'] = match_series_ep.group(1).strip().title() 
                tag_part = (match_series_ep.group(2) or match_series_ep.group(3) or match_series_ep.group(4) or "").upper()
                if tag_part:
                    if not tag_part.startswith("EP") and tag_part.isdigit():
                         game_data['series_tag'] = "EP" + tag_part
                    else:
                        game_data['series_tag'] = tag_part
    return game_data

_all_games_cache = {} 
_current_folder_path_cache = None 

def parse_single_md_file(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            post = frontmatter.load(f)
        
        metadata = post.metadata
        filename_base = os.path.basename(file_path)
        
        id_source = metadata.get('abbrlink') or metadata.get('title') or filename_base
        game_id = generate_safe_id(id_source)
        if not game_id: 
            game_id = generate_safe_id(os.path.splitext(filename_base)[0])

        initial_data = {
            'id': game_id, 
            'source_filename': filename_base,
            'title': metadata.get('title', f'Untitled ({filename_base})'),
            'abbrlink': metadata.get('abbrlink'),
            'date': str(metadata.get('date')) if metadata.get('date') else None,
        }
        
        game_details = parse_markdown_file_content(post.content, initial_data)
        return game_details

    except Exception as e:
        app.logger.error(f"Critical error parsing file {file_path}: {e}", exc_info=True)
        filename_base = os.path.basename(file_path)
        id_source = filename_base
        game_id = generate_safe_id(id_source)

        return {
            'id': game_id or f"error-id-{filename_base}",
            'source_filename': filename_base,
            'title': f"Error Parsing: {filename_base}",
            'abbrlink': None, 'date': None, 'cover_image': None,
            'names': {'japanese': None, 'english': None, 'chinese': None, 'aliases': []},
            'info': {'duration_str': None, 'duration_hours': None, 'duration_tier': "未知", 'developer': None, 'release_date': None, 'platforms': [], 'related_works': []},
            'download_links': [], 'screenshots': [],
            'description': f"Failed to parse this file. Check server logs for {filename_base}.",
            'parse_error': True
        }

def list_md_files_from_directory(directory_path):
    md_file_paths = []
    if not os.path.isdir(directory_path):
        app.logger.error(f"Provided path is not a directory: {directory_path}")
        return None 
    
    for item_name in os.listdir(directory_path):
        if item_name.lower().endswith(".md"):
            full_path = os.path.join(directory_path, item_name)
            md_file_paths.append(full_path)
    return md_file_paths

@app.route('/api/games_basic', methods=['POST'])
def get_games_basic_info():
    global _all_games_cache, _current_folder_path_cache
    request_data = request.get_json()
    if not request_data or 'folder_path' not in request_data:
        return jsonify({"error": "Request body must be JSON and include 'folder_path'"}), 400

    md_folder_path = request_data['folder_path']
    if ".." in md_folder_path:
         return jsonify({"error": "Invalid folder path."}), 400
    app.logger.info(f"Request for basic game info from: {md_folder_path}")

    if _current_folder_path_cache != md_folder_path or not _all_games_cache:
        _all_games_cache = {}
        _current_folder_path_cache = md_folder_path
        app.logger.info(f"Folder path changed or cache empty. Reparsing all files from {md_folder_path}")
    
        md_files = list_md_files_from_directory(md_folder_path)
        if md_files is None:
            return jsonify({"error": f"Could not access directory: {md_folder_path}"}), 404
        if not md_files:
            _all_games_cache = {} 
            return jsonify({"message": "No .md files found.", "games": []}), 200

        temp_parsed_games = {}
        for md_file_path in md_files:
            parsed_game_info = parse_single_md_file(md_file_path)
            if parsed_game_info and parsed_game_info.get('id'):
                if parsed_game_info['id'] in temp_parsed_games:
                    app.logger.warning(f"Duplicate game ID '{parsed_game_info['id']}' from file '{parsed_game_info['source_filename']}' (Original: '{temp_parsed_games[parsed_game_info['id']]['source_filename']}'). Overwriting.")
                temp_parsed_games[parsed_game_info['id']] = parsed_game_info
            else:
                app.logger.error(f"Failed to generate ID or parse {md_file_path}")
        _all_games_cache = temp_parsed_games
        app.logger.info(f"Parsed and cached {len(_all_games_cache)} games.")

    basic_games_data = []
    for game_id, game_data in _all_games_cache.items():
        display_title = game_data.get('names', {}).get('chinese') or \
                        game_data.get('names', {}).get('english') or \
                        game_data.get('names', {}).get('japanese') or \
                        game_data.get('title', 'Untitled')

        basic_info = {
            'id': game_data.get('id'),
            'title_display': display_title, 
            'title_original': game_data.get('title'), 
            'cover_image': game_data.get('cover_image'),
            'developer': game_data.get('info', {}).get('developer'),
            'release_date': game_data.get('info', {}).get('release_date'),
            'duration_tier': game_data.get('info', {}).get('duration_tier', "未知时长"),
            'duration_hours': game_data.get('info', {}).get('duration_hours'),
            'series_name': game_data.get('series_name'),
            'series_tag': game_data.get('series_tag'),
            'parse_error': game_data.get('parse_error', False)
        }
        basic_games_data.append(basic_info)
            
    app.logger.info(f"Returning basic info for {len(basic_games_data)} games.")
    return jsonify({"games": basic_games_data})

@app.route('/api/game_details/<game_id>', methods=['GET'])
def get_game_details(game_id):
    app.logger.info(f"Request for details of game_id: {game_id}")
    game_detail = _all_games_cache.get(game_id)
    if game_detail:
        full_details = {
            'id': game_detail.get('id'),
            'title': game_detail.get('title'), # This is the original title from metadata
            'source_filename': game_detail.get('source_filename'),
            'abbrlink': game_detail.get('abbrlink'),
            'date': game_detail.get('date'),
            'cover_image': game_detail.get('cover_image'),
            'names': game_detail.get('names', {'japanese': None, 'english': None, 'chinese': None, 'aliases': []}),
            'info': game_detail.get('info', {'duration_str': None, 'duration_hours': None, 'duration_tier': None, 'developer': None, 'release_date': None, 'platforms': [], 'related_works': []}),
            'description': game_detail.get('description'),
            'download_links': game_detail.get('download_links', []),
            'screenshots': game_detail.get('screenshots', []),
            'series_name': game_detail.get('series_name'),
            'series_tag': game_detail.get('series_tag'),
            'parse_error': game_detail.get('parse_error', False)
        }
        return jsonify(full_details)
    else:
        return jsonify({"error": "Game details not found"}), 404

if __name__ == '__main__':
    log_level_str = os.environ.get("LOGLEVEL", "INFO").upper()
    log_level = getattr(logging, log_level_str, logging.INFO)
    app.logger.setLevel(log_level)
    if not app.debug or not app.logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s'))
        app.logger.addHandler(handler)
    app.run(debug=True, host='127.0.0.1', port=7500)
