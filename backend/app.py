# file: app.py

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
    text = re.sub(r'[^a-z0-9]+', '-', text).strip('-') # Changed separator to '-' for better readability
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
    # Initialize with comprehensive structure
    game_data.update({
        'cover_image': None,
        'names': {'japanese': None, 'english': None, 'chinese': None, 'aliases': []},
        'info': {
            'duration_str': None,
            'duration_hours': None,
            'duration_tier': "未知时长", # Default tier
            'developer': None,
            'release_date': None,
            'platforms': [],
            'related_works': []
        },
        'download_links': [],
        'screenshots': [],
        'description': None,
        'series_name': None,
        'series_tag': None,
        'parse_error': game_data.get('parse_error', False), # Preserve if already set
        'parse_warning': game_data.get('parse_warning', None)
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
                if match: game_data['cover_image'] = match.group(1).strip()
            
            elif title == "游戏名称":
                name_lines = section_text.split('\n')
                for line in name_lines:
                    line = line.strip()
                    if line.startswith("- 日文："): game_data['names']['japanese'] = clean_none_string(line.replace("- 日文：", "").strip())
                    elif line.startswith("- 英文："): game_data['names']['english'] = clean_none_string(line.replace("- 英文：", "").strip())
                    elif line.startswith("- 中文："): game_data['names']['chinese'] = clean_none_string(line.replace("- 中文：", "").strip())
                    elif line.startswith("- 别名："):
                        aliases_str = line.replace("- 别名：", "").strip()
                        if aliases_str and aliases_str.lower() != 'none':
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
                        game_data['info']['duration_tier'] = get_duration_tier(hours) # Update tier
                    elif line.startswith("- 开发者："): game_data['info']['developer'] = clean_none_string(line.replace("- 开发者：", "").strip())
                    elif line.startswith("- 发售日期："): 
                        date_str = clean_none_string(str(line.replace("- 发售日期：", "").strip()))
                        if date_str and re.match(r'^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$', date_str):
                             game_data['info']['release_date'] = date_str.replace('.', '-').replace('/', '-') # Normalize date
                        elif date_str:
                            app.logger.warning(f"Invalid date format '{date_str}' for file {game_data.get('source_filename', 'Unknown')}. Setting to None.")
                            game_data['info']['release_date'] = None
                        else:
                            game_data['info']['release_date'] = None

                    elif line.startswith("- 游戏平台："):
                        platforms_str = line.replace("- 游戏平台：", "").strip()
                        if platforms_str and platforms_str.lower() != 'none':
                            game_data['info']['platforms'] = [p.strip() for p in platforms_str.split(',') if p.strip()]
                    elif line.startswith("- 相关作品："):
                        in_related_works_section = True
                    elif in_related_works_section and line.startswith("- ") and "：" in line:
                        try:
                            work_type_name_part = line.lstrip("- ").strip()
                            work_type, work_name = work_type_name_part.split("：", 1)
                            game_data['info']['related_works'].append({'type': work_type.strip(), 'name': work_name.strip()})
                            # Attempt to infer series_name if not already set and related work implies series
                            if not game_data['series_name'] and ('系列' in work_type or '前作' in work_type or '续作' in work_type or '本篇' in work_type):
                                # A simple heuristic: if the related work's name is a substring of the current game's title (or vice versa for common base)
                                current_title_base_for_series = game_data.get('title', '').split(' ')[0].lower() # Often first word is series
                                related_name_for_series = work_name.split(' ')[0].lower()

                                if current_title_base_for_series and related_name_for_series and len(related_name_for_series) > 2:
                                     # More robust: check if one is a prefix of another or shares a common significant prefix
                                    if current_title_base_for_series.startswith(related_name_for_series) or \
                                       related_name_for_series.startswith(current_title_base_for_series) or \
                                       any(current_title_base_for_series.startswith(alias.split(' ')[0].lower()) for alias in game_data['names']['aliases']):
                                        game_data['series_name'] = work_name.split(' ')[0].strip().title() # Use the related work's base name for series, capitalized
                                        app.logger.debug(f"Inferred series name '{game_data['series_name']}' from related work '{work_name}' for {game_data.get('source_filename')}")


                        except ValueError:
                            app.logger.warning(f"Could not parse related work line: '{line}' in file {game_data.get('source_filename', 'Unknown File')}")
                    elif in_related_works_section and not (line.startswith(" ") or line.startswith("-")): # End of related works list
                        in_related_works_section = False
            
            elif title == "游戏简介":
                description_text = re.sub(r'^\s*\[编辑此页面\].*?\n?', '', section_text, flags=re.MULTILINE).strip()
                game_data['description'] = description_text if description_text else None

            elif title == "下载链接":
                link_lines = section_text.split('\n')
                current_link_object = None
                for line_idx, line_content in enumerate(link_lines):
                    line = line_content.strip()
                    link_match = re.match(r'-\s*\[(.*?)\]\((.*?)\)', line)
                    if link_match:
                        if current_link_object: 
                            game_data['download_links'].append(current_link_object)
                        current_link_object = {'name': link_match.group(1).strip(), 'url': link_match.group(2).strip(), 'password': None}
                    elif line.startswith(("- 解压密码：", "- Password:")) and current_link_object:
                        pw = line.replace("- 解压密码：", "").replace("- Password:", "").strip()
                        current_link_object['password'] = pw if pw and pw.lower() != 'none' else None
                if current_link_object: # Add the last processed link
                    game_data['download_links'].append(current_link_object)


            elif title == "游戏截图":
                screenshot_matches = re.findall(r'!\[.*?\]\((.*?)\)', section_text)
                game_data['screenshots'].extend(s.strip() for s in screenshot_matches if s.strip()) 

        except Exception as e:
            app.logger.error(f"Error processing section '{title}' for file {game_data.get('source_filename', 'Unknown File')}: {e}", exc_info=True)
            game_data['parse_warning'] = (game_data.get('parse_warning') or "") + f"Error in section '{title}'. "


    content_lines = content_str.splitlines()
    for line_idx, line_content in enumerate(content_lines):
        header_match = re.match(r'^##\s+(.*)', line_content)
        if header_match:
            if current_section_title and current_section_lines: # Process previous section
                process_collected_section(current_section_title, current_section_lines)
            current_section_title = header_match.group(1).strip()
            current_section_lines = []
        elif current_section_title: # If we are inside a section
            # Exclude specific unwanted lines from section content
            if line_content.strip() and not line_content.strip().startswith("[编辑此页面]"):
                current_section_lines.append(line_content)
    
    if current_section_title and current_section_lines: # Process the last section
        process_collected_section(current_section_title, current_section_lines)

    # Series Name and Tag inference (refined)
    if not game_data['series_name'] and game_data.get('title'):
        title_lower = game_data['title'].lower()
        # More specific prefixes first
        common_prefixes_tags = {
            # Format: "lowercase_prefix_to_match": ("Display Series Name", "Optional Tag Prefix")
            "9-nine-": ("9-nine-", None),
            "nekopara vol.": ("Nekopara", "Vol."),
            "nekopara": ("Nekopara", None), # General fallback if vol. not specified
            "steins;gate": ("Steins;Gate", None),
            "robotics;notes": ("Robotics;Notes", None),
            "chaos;head": ("Chaos;Head", None),
            "chaos;child": ("Chaos;Child", None),
            "grisaia no kajitsu": ("Grisaia", "Kajitsu"),
            "grisaia no meikyuu": ("Grisaia", "Meikyuu"),
            "grisaia no rakuen": ("Grisaia", "Rakuen"),
            "grisaia phantom trigger": ("Grisaia Phantom Trigger", "Vol."),
            "riddle joker": ("Riddle Joker", None), 
        }
        series_found = False
        for prefix, (series_display_name, tag_prefix) in common_prefixes_tags.items():
            if title_lower.startswith(prefix):
                game_data['series_name'] = series_display_name
                remaining_title = title_lower.replace(prefix, "", 1).strip() # Replace only first occurrence
                
                # Try to extract a tag (e.g., episode number, volume number)
                tag_match = re.match(r'^(ep\s*\d+|vol\.\s*\d+|\d+|[ivxlcdm]+)(?:\s|$)', remaining_title, re.IGNORECASE)
                if tag_match:
                    tag = tag_match.group(1).upper()
                    if tag_prefix and not tag.startswith(tag_prefix.upper()):
                        game_data['series_tag'] = tag_prefix.strip() + " " + tag
                    elif not tag_prefix and tag.isdigit() and not game_data['series_tag']: # Avoid overwriting if already set
                         game_data['series_tag'] = "EP" + tag # Default tag prefix for numbers
                    elif not game_data['series_tag']:
                         game_data['series_tag'] = tag
                series_found = True
                break
        
        if not series_found: # Generic series parsing if no specific prefix matched
            # Matches patterns like "Series Name: Episode 1", "Series Name - Vol 2", "Series Name IV"
            match_series_ep = re.match(r'^(.*?)(?:[\s:_-]+(?:ep(?:isode)?|vol(?:ume)?|chapter|part|ภาค)[\s#.]*([a-z0-9]+)|[\s:_-]+([ivxlcdm]+)(?![a-z])|\s+(\d+)\s*作)$', title_lower, re.IGNORECASE)
            if match_series_ep:
                series_base_name = match_series_ep.group(1).strip()
                # Filter out common game suffixes that are not part of a series name if they appear at the end of series_base_name
                common_suffixes_to_remove = ['hd remaster', 'complete edition', 'plus', 'full voice']
                for suffix in common_suffixes_to_remove:
                    if series_base_name.lower().endswith(suffix): # case-insensitive check for suffix
                        series_base_name = series_base_name[:-len(suffix)].strip()
                
                if len(series_base_name) > 2 : # Avoid very short or empty series names
                    game_data['series_name'] = series_base_name.title()
                    tag_part = (match_series_ep.group(2) or match_series_ep.group(3) or match_series_ep.group(4) or "").upper()
                    if tag_part:
                        # Prepend "EP" if it's purely numeric and no other context suggests "Vol" etc.
                        if tag_part.isdigit() and not any(kw in title_lower for kw in ["vol", "volume", "chapter", "part"]):
                             game_data['series_tag'] = "EP" + tag_part
                        else:
                            game_data['series_tag'] = tag_part
    
    # Final check for duration tier if hours is known but tier wasn't set (e.g. direct metadata)
    if game_data['info']['duration_hours'] is not None and game_data['info']['duration_tier'] == "未知时长":
        game_data['info']['duration_tier'] = get_duration_tier(game_data['info']['duration_hours'])

    return game_data

_all_games_cache = {} 
_current_folder_path_cache = None 

def parse_single_md_file(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            post = frontmatter.load(f)
        
        metadata = post.metadata
        filename_base = os.path.basename(file_path)
        
        # Prioritize abbrlink for ID, then title, then filename
        id_source = metadata.get('abbrlink') or metadata.get('id') or metadata.get('title') or filename_base
        game_id = generate_safe_id(id_source)

        if not game_id: # Fallback if somehow all above are empty or result in empty ID
            game_id = generate_safe_id(os.path.splitext(filename_base)[0])
            app.logger.warning(f"Generated fallback ID '{game_id}' for file {filename_base} due to missing id sources in metadata.")


        initial_data = {
            'id': game_id, 
            'source_filename': filename_base,
            'title': metadata.get('title', f'Untitled ({filename_base})'), # Original title
            'abbrlink': metadata.get('abbrlink'),
            'date': str(metadata.get('date')) if metadata.get('date') else None, # Original date from frontmatter
            'parse_error': False,
            'parse_warning': None
        }
        
        # Directly map some frontmatter fields to game_data.info if they exist
        # This allows overriding parsed values or providing them if not in markdown body
        if 'developer' in metadata: initial_data.setdefault('info', {})['developer'] = metadata['developer']
        if 'release_date' in metadata:
            initial_data.setdefault('info', {})['release_date'] = str(metadata['release_date'])
        if 'duration' in metadata: # e.g., duration: 15h
            initial_data.setdefault('info', {})['duration_str'] = str(metadata['duration'])
            hours = parse_duration_to_hours(str(metadata['duration']))
            if hours is not None:
                initial_data['info']['duration_hours'] = hours
                initial_data['info']['duration_tier'] = get_duration_tier(hours)
        if 'platforms' in metadata and isinstance(metadata['platforms'], list):
            initial_data.setdefault('info', {})['platforms'] = metadata['platforms']
        if 'series' in metadata: initial_data['series_name'] = metadata['series']
        if 'series_tag' in metadata: initial_data['series_tag'] = metadata['series_tag']
        if 'cover' in metadata: initial_data['cover_image'] = metadata['cover']


        game_details = parse_markdown_file_content(post.content, initial_data)
        
        # Ensure ID is not None (should be caught earlier, but as a safeguard)
        if not game_details.get('id'):
            game_details['id'] = generate_safe_id(f"critical-id-fallback-{filename_base}")
            game_details['parse_error'] = True
            game_details['parse_warning'] = (game_details.get('parse_warning') or "") + "Critical: Game ID was missing after parsing. "
            app.logger.error(f"Critical ID generation failure for {filename_base}. Assigned fallback: {game_details['id']}")

        return game_details

    except Exception as e:
        app.logger.error(f"Critical error parsing file {file_path}: {e}", exc_info=True)
        filename_base = os.path.basename(file_path)
        # Try to generate an ID even in case of error for frontend tracking
        id_source_on_error = filename_base 
        game_id_on_error = generate_safe_id(id_source_on_error) or f"error-id-{generate_safe_id(os.path.splitext(filename_base)[0]) or os.path.splitext(filename_base)[0]}"


        return {
            'id': game_id_on_error,
            'source_filename': filename_base,
            'title': f"Error Parsing: {filename_base}", # Original title
            'title_display': f"Error Parsing: {filename_base}", # Display title
            'abbrlink': None, 'date': None, 'cover_image': None,
            'names': {'japanese': None, 'english': None, 'chinese': None, 'aliases': []},
            'info': {'duration_str': None, 'duration_hours': None, 'duration_tier': "未知时长", 'developer': None, 'release_date': None, 'platforms': [], 'related_works': []},
            'download_links': [], 'screenshots': [], 'description': f"Failed to parse this file. Check server logs for {filename_base}.",
            'series_name': None, 'series_tag': None,
            'parse_error': True,
            'parse_warning': f"File-level parsing exception: {str(e)}"
        }

def list_md_files_from_directory(directory_path):
    md_file_paths = []
    if not os.path.isdir(directory_path):
        app.logger.error(f"Provided path is not a directory: {directory_path}")
        return None 
    
    try:
        for item_name in os.listdir(directory_path):
            if item_name.lower().endswith(".md") and not item_name.startswith("~$"): # Ignore temp Word files
                full_path = os.path.join(directory_path, item_name)
                if os.path.isfile(full_path): # Ensure it's a file
                    md_file_paths.append(full_path)
    except OSError as e:
        app.logger.error(f"Error listing directory {directory_path}: {e}")
        return None
    return md_file_paths

@app.route('/api/games_basic', methods=['POST'])
def get_games_basic_info():
    global _all_games_cache, _current_folder_path_cache
    request_data = request.get_json()
    if not request_data or 'folder_path' not in request_data:
        return jsonify({"error": "Request body must be JSON and include 'folder_path'"}), 400

    md_folder_path = request_data['folder_path']
    # Basic path validation (more robust validation might be needed for security in a real app)
    if not md_folder_path or ".." in md_folder_path or not os.path.isabs(md_folder_path):
         return jsonify({"error": "Invalid or relative folder path provided."}), 400
    app.logger.info(f"Request for game info from: {md_folder_path}")

    # Cache invalidation logic: if path changes or cache is empty
    if _current_folder_path_cache != md_folder_path or not _all_games_cache:
        _all_games_cache = {} # Clear previous cache
        _current_folder_path_cache = md_folder_path
        app.logger.info(f"Folder path changed to '{md_folder_path}' or cache empty. Reparsing all files.")
    
        md_files = list_md_files_from_directory(md_folder_path)
        if md_files is None: # Error accessing directory
            return jsonify({"error": f"Could not access or read directory: {md_folder_path}. Check path and permissions."}), 404
        if not md_files: # No MD files found
            _all_games_cache = {} 
            return jsonify({"message": "No .md files found in the specified directory.", "games": []}), 200

        temp_parsed_games = {}
        processed_ids = set()
        parsing_warnings_summary = [] # Renamed to avoid conflict with local 'warnings' in loop

        for md_file_path in md_files:
            parsed_game_info = parse_single_md_file(md_file_path)
            
            if parsed_game_info and parsed_game_info.get('id'):
                game_id = parsed_game_info['id']
                if game_id in processed_ids:
                    warning_msg = f"Duplicate game ID '{game_id}' detected. File '{parsed_game_info['source_filename']}' conflicts with a previously processed file. This entry might be overwritten or unstable."
                    app.logger.warning(warning_msg)
                    parsing_warnings_summary.append(warning_msg) # Add to summary
                    # Add a parse warning to the new game object as well
                    parsed_game_info['parse_warning'] = (parsed_game_info.get('parse_warning') or "") + "Duplicate ID. "
                
                temp_parsed_games[game_id] = parsed_game_info
                processed_ids.add(game_id)
            else:
                # This case should be rare if parse_single_md_file always returns an ID
                err_file_name = os.path.basename(md_file_path) if md_file_path else "Unknown file"
                app.logger.error(f"Failed to generate ID or parse {err_file_name}. Skipping file.")
                parsing_warnings_summary.append(f"Skipped file {err_file_name} due to parsing/ID error.")
        
        _all_games_cache = temp_parsed_games
        app.logger.info(f"Parsed and cached {len(_all_games_cache)} games from {md_folder_path}.")
        if parsing_warnings_summary: # Use the renamed summary list
             app.logger.warning(f"Total parsing warnings during load: {len(parsing_warnings_summary)}")


    # Prepare the list of games to return (now full objects)
    games_to_return = []
    for game_id, game_data_full in _all_games_cache.items():
        current_game_copy = game_data_full.copy() # Work on a copy

        # Ensure 'title_display' is set for card rendering
        # Prefer Chinese, then English, then Japanese, then original 'title' metadata, then a fallback
        display_title = current_game_copy.get('names', {}).get('chinese') or \
                        current_game_copy.get('names', {}).get('english') or \
                        current_game_copy.get('names', {}).get('japanese') or \
                        current_game_copy.get('title') or \
                        f"Untitled ({current_game_copy.get('source_filename', 'N/A')})"
        current_game_copy['title_display'] = display_title

        # Ensure essential top-level fields for direct frontend access (sorting, card display)
        # These might also be in game_data_full.info, but having them top-level simplifies JS
        current_game_copy['developer'] = current_game_copy.get('info', {}).get('developer')
        current_game_copy['release_date'] = current_game_copy.get('info', {}).get('release_date')
        current_game_copy['duration_tier'] = current_game_copy.get('info', {}).get('duration_tier', "未知时长")
        current_game_copy['duration_hours'] = current_game_copy.get('info', {}).get('duration_hours')
        # series_name, series_tag, parse_error, parse_warning are already handled by parse_markdown_file_content

        games_to_return.append(current_game_copy)
            
    app.logger.info(f"Returning full data for {len(games_to_return)} games.")
    response_payload = {"games": games_to_return}
    
    # Collect IDs of games that have "Duplicate ID" in their parse_warning field
    # THIS IS THE CORRECTED LINE:
    path_warning_ids = [w_id for w_id, w_data in _all_games_cache.items() if "Duplicate ID" in (w_data.get('parse_warning') or "")]

    if path_warning_ids:
        # Construct user-friendly messages for these specific duplicate ID warnings
        duplicate_id_messages = []
        for w_id in path_warning_ids:
            game_info_for_warning = _all_games_cache.get(w_id)
            if game_info_for_warning: # Should always be true here
                 duplicate_id_messages.append(f"ID '{game_info_for_warning.get('id', 'N/A')}' in file '{game_info_for_warning.get('source_filename', 'N/A')}' is reported as a duplicate.")
        
        if duplicate_id_messages:
            # Add these to the response payload.
            # If 'warnings' already exists (e.g. from parsing_warnings_summary), append to it.
            # Otherwise, create it.
            # For simplicity, let's just send these specific duplicate ID warnings to the client.
            # The client-side already displays per-game parse_warning messages.
            response_payload['warnings'] = duplicate_id_messages


    return jsonify(response_payload)


@app.route('/api/game_details/<game_id>', methods=['GET'])
def get_game_details(game_id):
    app.logger.info(f"Request for details of game_id: {game_id}")
    game_detail = _all_games_cache.get(game_id) # Get from the same cache

    if game_detail:
        # The cache now stores full game objects, so we can return it directly
        # (after ensuring title_display for consistency, though not strictly needed for this endpoint)
        current_game_copy = game_detail.copy()
        display_title = current_game_copy.get('names', {}).get('chinese') or \
                        current_game_copy.get('names', {}).get('english') or \
                        current_game_copy.get('names', {}).get('japanese') or \
                        current_game_copy.get('title') or \
                        f"Untitled ({current_game_copy.get('source_filename', 'N/A')})"
        current_game_copy['title_display'] = display_title
        # Ensure all fields are present as expected by frontend modal
        current_game_copy['developer'] = current_game_copy.get('info', {}).get('developer')
        current_game_copy['release_date'] = current_game_copy.get('info', {}).get('release_date')
        current_game_copy['duration_tier'] = current_game_copy.get('info', {}).get('duration_tier', "未知时长")
        current_game_copy['duration_hours'] = current_game_copy.get('info', {}).get('duration_hours')


        return jsonify(current_game_copy)
    else:
        # Attempt to re-parse if not in cache and a folder path is known (e.g., server restarted, cache lost)
        if _current_folder_path_cache:
            app.logger.warning(f"Game ID {game_id} not in cache. Attempting to rescan folder {_current_folder_path_cache} to find it.")
            # Trigger a re-scan (this is a simplified way; a more robust system might re-parse just one file if possible)
            # For simplicity, we'll just re-trigger the main loading logic by clearing the cache path,
            # then try to get the game again. This is not ideal for performance on single lookups.
            # A better approach would be to find the specific file by ID if possible.
            # However, since IDs are generated, we can't directly map ID to filename without a full scan or an index.
            
            # Force a full rescan by clearing the path cache.
            # This is a heavy operation for a single miss.
            # A better strategy for a production app would be needed.
            # For now, we'll just indicate it's not found if not in the current cache.
            app.logger.warning(f"Game ID {game_id} not found in cache. If files were recently added, a reload via UI might be needed.")


        return jsonify({"error": "Game details not found. It might not be in the cache or the ID is incorrect."}), 404

if __name__ == '__main__':
    log_level_str = os.environ.get("LOGLEVEL", "INFO").upper()
    log_level = getattr(logging, log_level_str, logging.INFO)
    
    logging.basicConfig(level=log_level,
                        format='%(asctime)s - %(name)s - %(levelname)s - %(module)s:%(lineno)d - %(message)s', # Changed filename to module for brevity
                        handlers=[logging.StreamHandler()]) # Ensures logs go to console
    
    # Configure Flask's logger
    # Remove Flask's default handlers if we're using basicConfig, to avoid duplicate logs
    # if not app.debug: # Only do this if not in debug mode, as debug mode might have its own setup
    for handler in list(app.logger.handlers): # Iterate over a copy
        app.logger.removeHandler(handler)
    app.logger.propagate = False # Prevent passing to root logger if basicConfig is used
    
    # Add our configured handler to Flask's logger
    # This ensures Flask logs also use our format and level from basicConfig
    # This might not be strictly necessary if basicConfig already captures everything,
    # but it's good for explicit control.
    # However, basicConfig configures the root logger. Flask's logger is a child.
    # So, setting the level on Flask's logger is still important.
    app.logger.setLevel(log_level)
    
    # If you want Flask's own logs (like request logs from Werkzeug) to also use this format,
    # you might need to configure Werkzeug's logger too, or ensure Flask's logger propagates.
    # For now, basicConfig on root and setting Flask's logger level should be sufficient for app logs.

    app.run(debug=True, host='127.0.0.1', port=7500)

