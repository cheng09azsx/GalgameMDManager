// file: script.js

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================================================
    // 1. DOM Element Definitions & State Variables
    // ==========================================================================
    const folderPathInput = document.getElementById('folderPath');
    const loadGamesBtn = document.getElementById('loadGamesBtn');
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn'); // New search button
    const sortOrderSelect = document.getElementById('sortOrder');
    const filterDeveloperSelect = document.getElementById('filterDeveloper');
    const filterDurationTierSelect = document.getElementById('filterDurationTier');
    const filterSeriesSelect = document.getElementById('filterSeries');
    const filterFavoritesCheckbox = document.getElementById('filterFavorites');
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');

    const gamesListDiv = document.getElementById('gamesList');
    const statusMessageDiv = document.getElementById('statusMessage');
    const paginationControlsDiv = document.getElementById('paginationControls');

    const gameDetailModal = document.getElementById('gameDetailModal');
    const modalBody = document.getElementById('modalBody');
    const modalLoader = document.getElementById('modalLoader');

    const settingsFab = document.getElementById('settingsFab');
    const folderPathContainer = document.getElementById('folderPathContainer');
    const hideFolderPathBtn = document.getElementById('hideFolderPathBtn');

    let allGamesBasicData = [];
    let currentFilteredAndSortedGames = [];
    let favorites = new Set();
    let currentPage = 1;
    const itemsPerPage = 12; // Increased items per page slightly
    let lazyLoadObserver;
    let currentSearchTerm = ''; // Store the active search term for highlighting

    // SVG Icons
    const SVG_BOOKMARK_OUTLINE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/><path d="M0 0h24v24H0z" fill="none"/></svg>`;
    const SVG_BOOKMARK_FILLED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M0 0h24v24H0z" fill="none"/><path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>`;
    const SVG_ERROR_ICON = `<svg class="parse-error-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;
    const SVG_WARNING_ICON = `<svg class="parse-warning-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`;
    const SVG_COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`;

    // ==========================================================================
    // 2. Initialization & Event Listeners Setup
    // ==========================================================================
    function initializeApp() {
        if (!validateCriticalElements()) return;

        loadPreferences(); // Loads path and also tries to auto-load games
        loadFavorites();
        setupEventListeners();
        if (!folderPathInput.value) { // If no path saved, prompt user
            setStatus('点击右下角设置图标，输入MD文件夹路径 (绝对路径) 并点击 "加载资源" 开始。', 'info', true);
            disableFiltersAndSearch(true);
            folderPathContainer.classList.add('visible');
        }
    }

    function setupEventListeners() {
        loadGamesBtn.addEventListener('click', () => handleLoadGames(true)); // User initiated load
        folderPathInput.addEventListener('blur', savePreferences);
        folderPathInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') handleLoadGames(true);
        });
        settingsFab.addEventListener('click', toggleFolderPathInput);
        hideFolderPathBtn.addEventListener('click', toggleFolderPathInput);

        // Search triggered by button or Enter key
        searchBtn.addEventListener('click', triggerSearch);
        searchInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') triggerSearch();
        });

        sortOrderSelect.addEventListener('change', applyFiltersAndSort);
        filterDeveloperSelect.addEventListener('change', applyFiltersAndSort);
        filterDurationTierSelect.addEventListener('change', applyFiltersAndSort);
        filterSeriesSelect.addEventListener('change', applyFiltersAndSort);
        filterFavoritesCheckbox.addEventListener('change', applyFiltersAndSort);
        clearFiltersBtn.addEventListener('click', handleClearFilters);

        gameDetailModal.addEventListener('click', (event) => {
            if (event.target === gameDetailModal) closeGameDetailModal();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && gameDetailModal.style.display === 'block') {
                closeGameDetailModal();
            }
        });
    }

    function validateCriticalElements() {
        const elements = { folderPathInput, loadGamesBtn, searchInput, searchBtn, sortOrderSelect,
            filterDeveloperSelect, filterDurationTierSelect, filterSeriesSelect, filterFavoritesCheckbox,
            clearFiltersBtn, gamesListDiv, statusMessageDiv, paginationControlsDiv, gameDetailModal, modalBody,
            modalLoader, settingsFab, folderPathContainer, hideFolderPathBtn };
        for (const key in elements) {
            if (!elements[key]) {
                console.error(`Critical DOM element missing: ${key}. Check HTML ID.`);
                setStatus("页面初始化错误：部分界面元素缺失，请检查控制台。", "error", true);
                if (loadGamesBtn) loadGamesBtn.disabled = true;
                return false;
            }
        }
        return true;
    }

    // ==========================================================================
    // 3. UI Control Functions
    // ==========================================================================
    function setStatus(message, type = 'info', permanent = false) {
        statusMessageDiv.innerHTML = message; // Use innerHTML to allow icons in status
        statusMessageDiv.className = 'status';
        if (type) statusMessageDiv.classList.add(type);
        statusMessageDiv.style.display = message ? 'block' : 'none';
        if (permanent) statusMessageDiv.dataset.permanent = "true";
        else statusMessageDiv.removeAttribute('data-permanent');
    }

    function disableInteraction(disabled) {
        loadGamesBtn.disabled = disabled;
        disableFiltersAndSearch(disabled);
    }

    function disableFiltersAndSearch(disabled) {
        searchInput.disabled = disabled;
        searchBtn.disabled = disabled;
        sortOrderSelect.disabled = disabled;
        filterDeveloperSelect.disabled = disabled;
        filterDurationTierSelect.disabled = disabled;
        filterSeriesSelect.disabled = disabled;
        filterFavoritesCheckbox.disabled = disabled;
        clearFiltersBtn.disabled = disabled;
    }

    function toggleFolderPathInput() {
        folderPathContainer.classList.toggle('visible');
        if (folderPathContainer.classList.contains('visible')) {
            folderPathInput.focus();
        }
    }

    // ==========================================================================
    // 4. Preferences & Favorites Management
    // ==========================================================================
    function loadPreferences() {
        const savedPath = localStorage.getItem('mdFolderPath');
        if (savedPath) {
            folderPathInput.value = savedPath;
            // Automatically try to load games if path exists
            console.log("Found saved path, attempting auto-load:", savedPath);
            handleLoadGames(false); // false indicates non-user-initiated (auto-load)
        } else {
            disableFiltersAndSearch(true); // No path, disable filters
        }
    }
    function savePreferences() {
        localStorage.setItem('mdFolderPath', folderPathInput.value);
    }
    function loadFavorites() {
        const favsString = localStorage.getItem('galgameFavorites');
        if (favsString) {
            try { favorites = new Set(JSON.parse(favsString)); }
            catch (e) { console.error("Error parsing favorites:", e); favorites = new Set(); }
        }
    }
    function saveFavorites() {
        localStorage.setItem('galgameFavorites', JSON.stringify(Array.from(favorites)));
    }
    function toggleFavorite(gameId) {
        if (!gameId) return;
        if (favorites.has(gameId)) favorites.delete(gameId);
        else favorites.add(gameId);
        saveFavorites();

        const cardButton = gamesListDiv.querySelector(`.favorite-btn[data-game-id="${gameId}"]`);
        if (cardButton) {
            const isFav = favorites.has(gameId);
            cardButton.classList.toggle('is-favorite', isFav);
            cardButton.innerHTML = isFav ? SVG_BOOKMARK_FILLED : SVG_BOOKMARK_OUTLINE;
            cardButton.title = isFav ? "取消收藏" : "添加到收藏";
            cardButton.setAttribute('aria-pressed', isFav.toString());
        }
        if (filterFavoritesCheckbox.checked) applyFiltersAndSort();
    }

    // ==========================================================================
    // 5. Data Fetching & Processing (API Calls)
    // ==========================================================================
    async function handleLoadGames(isUserInitiated) {
        const folderPath = folderPathInput.value.trim();
        if (!folderPath) {
            if (isUserInitiated) { // Only show error if user explicitly tried to load an empty path
                setStatus('请输入MD文件夹的绝对路径。', 'error');
                folderPathContainer.classList.add('visible');
                folderPathInput.focus();
            } else {
                // Auto-load failed silently because no path was set, this is fine.
                // Status message from initializeApp will guide user.
                console.log("Auto-load skipped: No folder path set.");
            }
            disableFiltersAndSearch(true);
            return;
        }
        if (!(/^([a-zA-Z]:\\|\/)/.test(folderPath))) { // Basic absolute path check
             setStatus('请输入有效的绝对路径 (例如 C:\\games 或 /path/to/games)。', 'error', true);
             folderPathContainer.classList.add('visible');
             folderPathInput.focus();
             disableFiltersAndSearch(true);
             return;
        }

        if (folderPathContainer.classList.contains('visible') && isUserInitiated) {
             folderPathContainer.classList.remove('visible');
        }

        setStatus('正在加载游戏列表...', 'loading');
        disableInteraction(true);
        gamesListDiv.innerHTML = '<div class="loading-spinner-container"><div class="loading-spinner"></div><p>数据加载中，请稍候...</p></div>';
        paginationControlsDiv.innerHTML = '';
        allGamesBasicData = [];
        currentFilteredAndSortedGames = [];
        currentPage = 1;
        populateSelect(filterDeveloperSelect, new Set(), "所有开发商", true);
        populateSelect(filterSeriesSelect, new Set(), "所有系列", true);

        try {
            const response = await fetch('http://127.0.0.1:7500/api/games_basic', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder_path: folderPath }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `服务器响应错误: ${response.status}` }));
                throw new Error(errorData.error || `服务器响应错误: ${response.status}`);
            }
            const data = await response.json();

            if (data.games && Array.isArray(data.games)) {
                // Backend now sends full game objects, so mapping is simpler.
                // Ensure defaults for any potentially missing crucial fields if backend doesn't guarantee them.
                allGamesBasicData = data.games.map(game => ({
                    ...game, // Spread all properties from the backend
                    id: game.id || `unknown-id-${Math.random().toString(36).substr(2, 9)}`,
                    // title_display should be provided by backend
                    // developer, release_date, duration_tier, duration_hours are top-level from backend
                    // series_name, series_tag are top-level
                    // parse_error is top-level
                    // names, info, description, screenshots, download_links, source_filename, abbrlink
                    // should now all be present as sent by backend.
                    // Ensure 'info' object exists for consistent access, even if backend guarantees it
                    info: game.info || { developer: null, release_date: null, duration_tier: "未知时长", duration_hours: null, platforms: [], related_works: [] },
                }));

                let statusMsg = "";
                if (allGamesBasicData.length > 0) {
                    populateFilterOptions(allGamesBasicData);
                    applyFiltersAndSort(); // This will render the first page
                    statusMsg = `成功加载 ${allGamesBasicData.length} 个游戏。`;
                    if (data.warnings && data.warnings.length > 0) { // Global warnings from backend
                        statusMsg += ` <span title="${data.warnings.join('\n')}">${SVG_WARNING_ICON} (${data.warnings.length}条加载警告)</span>`;
                    }
                    setStatus(statusMsg, 'success');
                    disableFiltersAndSearch(false);
                } else {
                    gamesListDiv.innerHTML = ''; // Clear loading spinner
                    setStatus(data.message || '未找到 .md 文件或文件夹中无内容。', 'info', true);
                    disableFiltersAndSearch(true);
                }
            } else {
                gamesListDiv.innerHTML = ''; // Clear loading spinner
                setStatus('响应数据格式不正确或未包含游戏列表。', 'info', true);
                disableFiltersAndSearch(true);
            }
        } catch (error) {
            console.error('加载游戏失败:', error);
            gamesListDiv.innerHTML = ''; // Clear loading spinner
            let errorMsg = `错误: ${error.message || '未知错误'}`;
            if (!isUserInitiated) { // If auto-load fails
                errorMsg += ` (自动加载上次路径失败). 请检查路径或手动加载。`;
                folderPathContainer.classList.add('visible'); // Show path input on auto-load fail
            }
            setStatus(errorMsg, 'error', true);
            disableFiltersAndSearch(true);
        } finally {
            // Re-enable general interaction (filters, search) only if games were loaded successfully
            // loadGamesBtn should always be re-enabled.
            loadGamesBtn.disabled = false;
            if (allGamesBasicData.length > 0) {
                disableFiltersAndSearch(false);
            } else {
                disableFiltersAndSearch(true); // Keep disabled if load failed or no games
            }
        }
    }

    async function fetchGameDetails(gameId) { // Game object from cache now has full details
        const game = allGamesBasicData.find(g => g.id === gameId);
        if (game) {
            return Promise.resolve(game);
        }
        // This part should ideally not be reached if all games are preloaded.
        const errorMsg = `游戏 (ID: ${gameId}) 未在预加载数据中找到。弹窗无法显示。`;
        console.error(errorMsg);
        // Optionally, you could still try to fetch from /api/game_details/ here as a last resort
        // but the design is to preload everything with /api/games_basic.
        return Promise.reject(new Error(errorMsg));
    }

    // ==========================================================================
    // 6. Filtering & Sorting Logic
    // ==========================================================================
    function triggerSearch() {
        currentSearchTerm = searchInput.value.toLowerCase().trim(); // Update global search term
        applyFiltersAndSort();
    }

    function handleClearFilters() {
        searchInput.value = '';
        currentSearchTerm = ''; // Clear global search term
        sortOrderSelect.value = 'title_display_asc';
        filterDeveloperSelect.value = '';
        filterDurationTierSelect.value = '';
        filterSeriesSelect.value = '';
        filterFavoritesCheckbox.checked = false;
        applyFiltersAndSort();
        if (allGamesBasicData.length > 0) {
            setStatus(`已清空所有筛选条件，显示 ${currentFilteredAndSortedGames.length} 个游戏。`, 'info');
        } else if (statusMessageDiv.dataset.permanent !== "true") { // Don't overwrite permanent messages like "load resources"
             setStatus('请先加载资源。', 'info', true); // Or previous permanent message
        }
    }

    function applyFiltersAndSort() {
        let filtered = [...allGamesBasicData];
        // currentSearchTerm is used for filtering, searchInput.value is just for display
        const searchTermToUse = currentSearchTerm;
        const selectedDev = filterDeveloperSelect.value;
        const selectedDuration = filterDurationTierSelect.value; // This is correct (value from select)
        const selectedSeries = filterSeriesSelect.value;
        const showOnlyFavorites = filterFavoritesCheckbox.checked;
        const sortValue = sortOrderSelect.value;

        if (showOnlyFavorites) filtered = filtered.filter(game => favorites.has(game.id));
        if (searchTermToUse) {
            filtered = filtered.filter(game => {
                const searchFields = [
                    game.title_display, game.developer, game.series_name,
                    game.title_original, game.names?.chinese, game.names?.japanese,
                    game.names?.english, ...(game.names?.aliases || [])
                ];
                return searchFields.some(field => field && String(field).toLowerCase().includes(searchTermToUse));
            });
        }
        if (selectedDev) filtered = filtered.filter(game => game.developer === selectedDev);
        // Filter by duration_tier (which is now top-level in game objects)
        if (selectedDuration) filtered = filtered.filter(game => game.duration_tier === selectedDuration);
        if (selectedSeries) filtered = filtered.filter(game => game.series_name === selectedSeries);

        const [sortField, sortDirection] = sortValue.split('_');
        const asc = sortDirection === 'asc';

        filtered.sort((a, b) => {
            let valA, valB;
            if (sortField === 'release_date') {
                // release_date is now top-level
                valA = a.release_date; valB = b.release_date;
                // Robust date parsing and comparison
                const dateA = valA ? new Date(String(valA).replace(/\./g, '-')) : null;
                const dateB = valB ? new Date(String(valB).replace(/\./g, '-')) : null;

                // Check if dates are valid after parsing
                const isValidDateA = dateA && !isNaN(dateA.getTime());
                const isValidDateB = dateB && !isNaN(dateB.getTime());

                if (!isValidDateA && !isValidDateB) return 0;
                if (!isValidDateA) return asc ? 1 : -1; // Nulls/Invalid dates last on asc, first on desc
                if (!isValidDateB) return asc ? -1 : 1;
                return asc ? dateA - dateB : dateB - dateA;

            } else if (sortField === 'duration_hours') {
                // duration_hours is now top-level
                valA = a.duration_hours; valB = b.duration_hours;
                // Handle null/undefined by sorting them to one end
                valA = (valA === null || valA === undefined) ? (asc ? Infinity : -Infinity) : parseFloat(valA);
                valB = (valB === null || valB === undefined) ? (asc ? Infinity : -Infinity) : parseFloat(valB);
                return asc ? valA - valB : valB - valA;
            } else { // title_display (default sort field)
                valA = (a[sortField] || '').toString().toLowerCase();
                valB = (b[sortField] || '').toString().toLowerCase();
                if (valA < valB) return asc ? -1 : 1;
                if (valA > valB) return asc ? 1 : -1;
                return 0;
            }
        });

        currentFilteredAndSortedGames = filtered;
        currentPage = 1;
        renderPage(); // This calls displayGamesForCurrentPage and renderPaginationControls

        // Update status message, but don't overwrite permanent error/initial messages
        if (statusMessageDiv.dataset.permanent !== "true") {
            if (allGamesBasicData.length > 0) {
                if (filtered.length === 0) {
                     setStatus('没有符合当前筛选条件的游戏。', 'info');
                } else if (searchTermToUse || selectedDev || selectedDuration || selectedSeries || showOnlyFavorites) {
                     setStatus(`筛选出 ${filtered.length} 个游戏。`, 'info');
                } else {
                     // Preserve success status if it was set by initial load
                     const currentStatusType = statusMessageDiv.classList.contains('success') ? 'success' : 'info';
                     setStatus(`显示 ${allGamesBasicData.length} 个游戏。`, currentStatusType);
                }
            } else if (!statusMessageDiv.textContent.includes("错误") && !statusMessageDiv.textContent.includes("加载资源")) {
                // Only clear if not an error or initial prompt
                setStatus('', 'info');
            }
        }
    }

    function populateFilterOptions(games) {
        const developers = new Set();
        const seriesNames = new Set();
        games.forEach(game => {
            // developer is top-level
            if (game.developer) developers.add(game.developer);
            if (game.series_name) seriesNames.add(game.series_name);
        });
        populateSelect(filterDeveloperSelect, developers, "所有开发商");
        populateSelect(filterSeriesSelect, seriesNames, "所有系列");
    }

    function populateSelect(selectElement, optionsSet, defaultOptionText, forceClear = false) {
        const currentValue = selectElement.value; // Save current selection
        // Clear existing options except the default one if not forcing a full clear
        if (forceClear || selectElement.options.length <=1) {
             selectElement.innerHTML = `<option value="">${defaultOptionText}</option>`;
        } else {
            // Keep the default option, remove others before repopulating
            while (selectElement.options.length > 1) {
                selectElement.remove(1);
            }
        }
        
        const sortedOptions = Array.from(optionsSet).sort((a, b) => String(a).toLowerCase().localeCompare(String(b).toLowerCase()));
        
        sortedOptions.forEach(optionValue => {
            // Check if this option (excluding default) already exists
            let exists = false;
            for (let i = 1; i < selectElement.options.length; i++) { // Start from 1 to skip default
                if (selectElement.options[i].value === optionValue) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                const option = document.createElement('option');
                option.value = optionValue; option.textContent = optionValue;
                selectElement.appendChild(option);
            }
        });

        // Try to restore previous selection if still valid, otherwise default to ""
        selectElement.value = Array.from(selectElement.options).some(opt => opt.value === currentValue) ? currentValue : "";
    }

    // ==========================================================================
    // 7. Rendering Functions (Cards, Pagination, Modal)
    // ==========================================================================
    function renderPage() {
        displayGamesForCurrentPage();
        renderPaginationControls();
    }

    function highlightText(text, query) {
        if (!query || !text) return String(text || ''); // Ensure text is string and handle null/undefined
        // Escape regex special characters in query
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedQuery})`, 'gi');
        return String(text).replace(regex, '<mark class="search-highlight">$1</mark>');
    }

    function displayGamesForCurrentPage() {
        gamesListDiv.innerHTML = ''; // Clear previous game cards
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const gamesToDisplay = currentFilteredAndSortedGames.slice(startIndex, endIndex);

        if (gamesToDisplay.length === 0) {
            // Status message for no results is handled by applyFiltersAndSort or handleLoadGames
            return;
        }

        gamesToDisplay.forEach(game => {
            const card = document.createElement('div');
            card.classList.add('game-card');
            if (game.parse_error) card.classList.add('parse-error-card');
            // Use game.parse_warning (which is the string message from backend)
            if (game.parse_warning && !game.parse_error) card.classList.add('parse-warning-card'); // Only add if not already an error


            const favButton = document.createElement('button');
            favButton.classList.add('favorite-btn');
            favButton.dataset.gameId = game.id || ''; // Ensure ID is set
            const isFav = favorites.has(game.id);
            favButton.classList.toggle('is-favorite', isFav);
            favButton.innerHTML = isFav ? SVG_BOOKMARK_FILLED : SVG_BOOKMARK_OUTLINE;
            favButton.title = isFav ? "取消收藏" : "添加到收藏";
            favButton.setAttribute('aria-pressed', isFav.toString());
            favButton.addEventListener('click', (e) => { e.stopPropagation(); toggleFavorite(game.id); });
            card.appendChild(favButton);

            let indicatorHtml = '';
            if (game.parse_error) {
                // Tooltip includes source_filename and the specific parse_warning if available
                const errorTooltip = `文件 '${game.source_filename || 'N/A'}' 解析时遇到严重问题. ${game.parse_warning || ''} 详情请查看弹窗。`.trim().replace(/"/g, '&quot;');
                indicatorHtml = `<span class="parse-indicator parse-error-indicator" title="${errorTooltip}">${SVG_ERROR_ICON}</span>`;
            } else if (game.parse_warning) { // Show warning only if not a full error
                 const warningTooltip = `文件 '${game.source_filename || 'N/A'}' 解析警告: ${game.parse_warning} 点击查看详情。`.trim().replace(/"/g, '&quot;');
                 indicatorHtml = `<span class="parse-indicator parse-warning-indicator" title="${warningTooltip}">${SVG_WARNING_ICON}</span>`;
            }
            if(indicatorHtml) card.insertAdjacentHTML('beforeend', indicatorHtml);


            const coverWrapper = document.createElement('div');
            coverWrapper.classList.add('game-cover-wrapper');
            const coverImg = document.createElement('img');
            coverImg.classList.add('game-cover');
            coverImg.alt = `${game.title_display || '游戏'} 封面`; // Use title_display
            const placeholder = document.createElement('span');
            placeholder.classList.add('game-cover-placeholder');
            coverWrapper.appendChild(placeholder); // Add placeholder first
            if (game.cover_image) {
                coverImg.dataset.src = game.cover_image;
                observeElementForLazyLoad(coverImg);
                coverWrapper.insertBefore(coverImg, placeholder); // Insert image before placeholder
                placeholder.textContent = '封面加载中...'; placeholder.style.display = 'flex';
            } else {
                placeholder.textContent = game.parse_error ? '信息不足' : '无封面';
                placeholder.style.display = 'flex';
            }

            const cardContent = document.createElement('div');
            cardContent.classList.add('game-card-content');
            let seriesTagHtml = '';
            if (game.series_name) {
                seriesTagHtml = `<p class="game-series-tag-card">${highlightText(game.series_name, currentSearchTerm)}${game.series_tag ? ` <small>(${highlightText(game.series_tag, currentSearchTerm)})</small>` : ''}</p>`;
            }
            
            // game.info.platforms (info object is now passed through and guaranteed by map)
            const platforms = game.info?.platforms;
            let platformsHtml = '';
            if (platforms && Array.isArray(platforms) && platforms.length > 0) {
                platformsHtml = `<p class="game-platforms-card">平台: ${platforms.map(p => highlightText(p, currentSearchTerm)).join(', ')}</p>`;
            }

            // Use title_display from the game object
            const displayTitle = game.title_display || (game.parse_error ? '解析错误' : '无标题');
            const highlightedTitle = highlightText(displayTitle, currentSearchTerm);

            cardContent.innerHTML = `
                <div class="game-info-bar">
                    <span class="duration-capsule">${game.duration_tier || '未知'}</span>
                    ${game.release_date ? `<span class="game-release-date-card">${game.release_date}</span>` : ''}
                </div>
                <h3 class="game-title" title="${displayTitle}">${highlightedTitle}</h3>
                ${game.developer ? `<p class="game-developer">${highlightText(game.developer, currentSearchTerm)}</p>` : ''}
                ${platformsHtml}
                ${seriesTagHtml}
                <button class="details-button" data-game-id="${game.id || ''}" aria-label="查看 ${displayTitle} 的详情">查看详情</button>
            `;
            card.appendChild(coverWrapper); card.appendChild(cardContent);
            gamesListDiv.appendChild(card);

            const detailsButton = card.querySelector('.details-button');
            if (detailsButton) {
                if (game.id) { // Ensure game.id exists before adding listener
                    detailsButton.addEventListener('click', (e) => {
                        // Get gameId from the button itself, not a parent if event bubbles
                        const gameId = e.currentTarget.dataset.gameId;
                        if (gameId) openGameDetailModal(gameId);
                    });
                } else {
                    detailsButton.disabled = true; detailsButton.title = "游戏ID缺失";
                }
            }
        });
    }

    function renderPaginationControls() {
        paginationControlsDiv.innerHTML = '';
        const totalPages = Math.ceil(currentFilteredAndSortedGames.length / itemsPerPage);
        if (totalPages <= 1) return;
        const ul = document.createElement('ul');
        ul.classList.add('pagination-list');
        const createPageButton = (text, page, isDisabled, isCurrent = false, label) => {
            const li = document.createElement('li'); if (isCurrent) li.classList.add('active');
            const button = document.createElement('button'); button.innerHTML = text;
            button.classList.add('pagination-button'); if (label) button.setAttribute('aria-label', label);
            button.disabled = isDisabled;
            if (!isDisabled) {
                button.addEventListener('click', () => { currentPage = page; renderPage(); scrollToGameListTop(); });
            }
            li.appendChild(button); return li;
        };
        ul.appendChild(createPageButton('上一页', currentPage - 1, currentPage === 1, false, '跳转到上一页'));
        const pageInfoLi = document.createElement('li'); pageInfoLi.classList.add('pagination-info');
        pageInfoLi.textContent = `第 ${currentPage} / ${totalPages} 页`; pageInfoLi.setAttribute('aria-live', 'polite');
        ul.appendChild(pageInfoLi);
        ul.appendChild(createPageButton('下一页', currentPage + 1, currentPage === totalPages, false, '跳转到下一页'));
        paginationControlsDiv.appendChild(ul);
    }

    function scrollToGameListTop() {
        const header = document.querySelector('.app-header');
        const headerHeight = header ? header.offsetHeight : 0;
        // Calculate target scroll position considering header height and a small buffer
        const elementTop = gamesListDiv.getBoundingClientRect().top + window.pageYOffset - headerHeight - 15; // 15px buffer
        window.scrollTo({ top: Math.max(0, elementTop), behavior: 'smooth' }); // Ensure not scrolling to negative
    }

    async function openGameDetailModal(gameId) {
        if (!gameId) return;
        gameDetailModal.style.display = 'block'; document.body.style.overflow = 'hidden';
        modalBody.innerHTML = ''; modalLoader.style.display = 'block';
        
        // Remove previous header if it exists, before adding a new one
        const existingHeader = gameDetailModal.querySelector('.modal-header');
        if (existingHeader) existingHeader.remove();

        try {
            const game = await fetchGameDetails(gameId); // Game object from cache should be complete
            renderGameDetailsToModal(game);
        } catch (error) {
            modalBody.innerHTML = `<p class="error" style="color: red; text-align: center;">加载游戏详情失败: ${error.message || '未知错误'}</p>`;
            console.error("Error fetching/rendering game details:", error);
        } finally {
            modalLoader.style.display = 'none';
        }
    }

    function renderGameDetailsToModal(game) {
        const modalContentDiv = gameDetailModal.querySelector('.modal-content');
        if (!modalContentDiv) {
            console.error("Modal content div not found!");
            return;
        }

        // Determine the display title for the modal header
        // Prioritize Chinese, then English, then Japanese, then game.title_display (card title), then original title
        let displayTitleInModal = game.names?.chinese || game.names?.english || game.names?.japanese || game.title_display || game.title_original || '无标题';

        const modalHeader = document.createElement('div'); modalHeader.classList.add('modal-header');
        const modalTitleH2 = document.createElement('h2'); modalTitleH2.id = 'modalTitle';
        modalTitleH2.innerHTML = highlightText(displayTitleInModal, currentSearchTerm);
        modalHeader.appendChild(modalTitleH2);
        const closeBtn = document.createElement('button'); closeBtn.classList.add('close-button');
        closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
        closeBtn.setAttribute('aria-label', '关闭详情'); closeBtn.onclick = closeGameDetailModal;
        modalHeader.appendChild(closeBtn);
        modalContentDiv.insertBefore(modalHeader, modalBody); // Insert header before modalBody

        const buildSection = (title, content) => {
            const cleanContent = (typeof content === 'string' ? content.trim() : '');
            // Ensure content is not just empty or an empty list string
            return cleanContent && cleanContent !== '<ul></ul>' && cleanContent !== '<p></p>' ? `<div class="modal-section"><h3>${title}</h3>${content}</div>` : '';
        }

        let namesHtml = '';
        if (game.names) { // game.names is now available from the full game object
            if (game.names.japanese && game.names.japanese !== displayTitleInModal) namesHtml += `<p><strong>日文名：</strong> ${highlightText(game.names.japanese, currentSearchTerm)}</p>`;
            if (game.names.english && game.names.english !== displayTitleInModal) namesHtml += `<p><strong>英文名：</strong> ${highlightText(game.names.english, currentSearchTerm)}</p>`;
            if (game.names.chinese && game.names.chinese !== displayTitleInModal) namesHtml += `<p><strong>中文名：</strong> ${highlightText(game.names.chinese, currentSearchTerm)}</p>`;
            if (game.names.aliases && game.names.aliases.length > 0) namesHtml += `<p><strong>别名：</strong> <span class="aliases">${game.names.aliases.map(a => highlightText(a, currentSearchTerm)).join(', ')}</span></p>`;
        }
        
        let infoHtml = '';
        // Access fields directly from game object or game.info as appropriate
        if (game.developer) infoHtml += `<p><strong>开发商：</strong> ${highlightText(game.developer, currentSearchTerm)}</p>`;
        if (game.release_date) infoHtml += `<p><strong>发售日期：</strong> ${game.release_date}</p>`;
        
        let durationDisplay = '';
        if (game.info?.duration_str) durationDisplay = game.info.duration_str; // Prefer original string if available
        else if (game.duration_hours !== null && game.duration_hours !== undefined) durationDisplay = `${game.duration_hours}h`; // Fallback to hours
        
        if (durationDisplay) { // Only add if there's something to display
            infoHtml += `<p><strong>时长：</strong> ${durationDisplay}${game.duration_tier && game.duration_tier !== "未知时长" ? ` (${game.duration_tier})` : ''}</p>`;
        }

        if (game.info?.platforms && game.info.platforms.length > 0) infoHtml += `<p><strong>平台：</strong> ${game.info.platforms.join(', ')}</p>`;
        if (game.series_name) infoHtml += `<p><strong>系列：</strong> ${highlightText(game.series_name, currentSearchTerm)}${game.series_tag ? ` (${highlightText(game.series_tag, currentSearchTerm)})` : ''}</p>`;
        if (game.info?.related_works && game.info.related_works.length > 0) {
            infoHtml += `<p><strong>相关作品：</strong></p><ul>`;
            game.info.related_works.forEach(work => { infoHtml += `<li>${highlightText(work.type, currentSearchTerm)}： ${highlightText(work.name, currentSearchTerm)}</li>`; });
            infoHtml += `</ul>`;
        }
        
        let descriptionHtml = '';
        let errorWarningMessages = ''; // For parse_error and parse_warning
        if (game.parse_error) {
            errorWarningMessages += `<p class="error-message"><strong>严重错误：</strong> 此游戏元数据解析可能不完整或失败。源文件: ${game.source_filename || 'N/A'}. ${game.parse_warning || ''}</p>`;
        } else if (game.parse_warning) { // Show parse_warning if not a full error
            errorWarningMessages += `<p class="warning-message"><strong>解析警告：</strong> ${game.parse_warning} (源文件: ${game.source_filename || 'N/A'})</p>`;
        }


        // game.description is now available from the full game object
        if (game.description) descriptionHtml = `<p>${String(game.description).replace(/\n/g, '<br>')}</p>`;
        else if (!game.parse_error) descriptionHtml = `<p>暂无简介。</p>` // Only show "no description" if not a parse error


        let screenshotsHtml = '';
        // game.screenshots is now available
        if (game.screenshots && game.screenshots.length > 0) {
            screenshotsHtml = '<div class="modal-screenshots">';
            game.screenshots.filter(ss => ss).forEach(ssUrl => { screenshotsHtml += `<div class="modal-screenshot-item"><img src="${ssUrl}" alt="截图" loading="lazy" onclick="window.open('${ssUrl}', '_blank', 'noopener,noreferrer')" tabindex="0" role="button"></div>`; });
            screenshotsHtml += '</div>';
        }
        
        let downloadsHtml = '<ul>';
        // game.download_links is now available
        if (game.download_links && game.download_links.length > 0) {
            game.download_links.forEach(link => {
                downloadsHtml += `<li><a href="${link.url || '#'}" target="_blank" rel="noopener noreferrer">${link.name || '下载链接'}</a>`;
                if (link.password) {
                    const passwordId = `pw-${game.id}-${generateSimpleId(link.name || 'link')}`; // Ensure link.name is somewhat unique
                    downloadsHtml += ` <span class="password-info">(密码: <span id="${passwordId}" class="password-text">${link.password}</span> <button class="copy-password-btn" data-clipboard-target="#${passwordId}" title="复制密码">${SVG_COPY_ICON} <span>复制</span></button>)</span>`;
                }
                downloadsHtml += `</li>`;
            });
        } else downloadsHtml += '<li>暂无下载链接。</li>';
        downloadsHtml += '</ul>';

        modalBody.innerHTML = `
            ${game.cover_image ? `<img src="${game.cover_image}" alt="${displayTitleInModal}封面" class="modal-cover-image" loading="lazy">` : ''}
            ${errorWarningMessages}
            ${buildSection('基本信息', namesHtml + infoHtml)}
            ${buildSection('游戏简介', descriptionHtml)}
            ${buildSection('游戏截图', screenshotsHtml)}
            ${buildSection('下载链接', downloadsHtml)}
            <p class="modal-footer-info">源文件: ${game.source_filename || 'N/A'} | Abbrlink: ${game.abbrlink || 'N/A'} | ID: ${game.id || 'N/A'}</p>`;
        
        modalBody.querySelectorAll('.copy-password-btn').forEach(button => {
            button.addEventListener('click', () => copyPasswordToClipboard(button));
        });
    }

    function generateSimpleId(str) {
        if (!str) return Math.random().toString(36).substr(2, 5);
        // Create a more unique ID from string to avoid collisions
        const hash = String(str).split('').reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) | 0, 0);
        return `id${Math.abs(hash).toString(36)}${Math.random().toString(36).substr(2, 3)}`;
    }

    function copyPasswordToClipboard(buttonElement) {
        const targetSelector = buttonElement.dataset.clipboardTarget;
        const passwordSpan = document.querySelector(targetSelector);
        if (passwordSpan && navigator.clipboard) {
            navigator.clipboard.writeText(passwordSpan.textContent)
                .then(() => {
                    const originalTextSpan = buttonElement.querySelector('span');
                    if (originalTextSpan) {
                        const originalText = originalTextSpan.textContent;
                        originalTextSpan.textContent = '已复制!'; buttonElement.disabled = true;
                        setTimeout(() => { originalTextSpan.textContent = originalText; buttonElement.disabled = false; }, 1500);
                    }
                }).catch(err => { console.error('无法复制密码: ', err); alert('复制失败。'); });
        } else if (passwordSpan) { // Fallback for older browsers or insecure contexts
            const textArea = document.createElement("textarea");
            textArea.value = passwordSpan.textContent;
            textArea.style.position = "fixed"; textArea.style.left = "-9999px"; // Prevent flicker
            document.body.appendChild(textArea);
            textArea.focus(); textArea.select();
            try {
                document.execCommand('copy');
                const originalTextSpan = buttonElement.querySelector('span');
                 if (originalTextSpan) {
                    const originalText = originalTextSpan.textContent;
                    originalTextSpan.textContent = '已复制!'; buttonElement.disabled = true;
                    setTimeout(() => { originalTextSpan.textContent = originalText; buttonElement.disabled = false; }, 1500);
                }
            } catch (err) {
                console.error('execCommand copy failed: ', err);
                alert('复制失败 (fallback)。');
            }
            document.body.removeChild(textArea);
        } else {
             alert('无法找到密码元素或浏览器不支持复制。');
        }
    }

    function closeGameDetailModal() {
        if (gameDetailModal.style.display === 'block') {
            gameDetailModal.style.display = 'none'; document.body.style.overflow = 'auto';
            const existingHeader = gameDetailModal.querySelector('.modal-header');
            if (existingHeader) existingHeader.remove(); // Clean up header
            modalBody.innerHTML = ''; // Clear body content to free up resources and prevent stale data
        }
    }

    // ==========================================================================
    // 8. Image Lazy Loading
    // ==========================================================================
    function getLazyLoadObserver() {
        if (!lazyLoadObserver) {
            lazyLoadObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target; const src = img.dataset.src;
                        const wrapper = img.closest('.game-cover-wrapper');
                        const placeholder = wrapper ? wrapper.querySelector('.game-cover-placeholder') : null;
                        if (src) {
                            img.src = src;
                            img.onload = () => { img.classList.add('loaded'); if (placeholder) placeholder.style.display = 'none'; };
                            img.onerror = () => {
                                console.warn(`Failed to load image: ${src}`); img.style.display = 'none'; // Hide broken image
                                if (placeholder) { placeholder.textContent = '图片加载失败'; placeholder.style.display = 'flex'; }
                            };
                        } else if (placeholder) { // Should not happen if src is always set for observed images
                            placeholder.textContent = placeholder.dataset.defaultText || '无封面'; placeholder.style.display = 'flex';
                        }
                        observer.unobserve(img); // Unobserve after loading (or error) to save resources
                    }
                });
            }, { rootMargin: "0px 0px 200px 0px" }); // Load images 200px before they enter viewport
        }
        return lazyLoadObserver;
    }
    function observeElementForLazyLoad(element) { getLazyLoadObserver().observe(element); }

    // --- Start the application ---
    initializeApp();
});
