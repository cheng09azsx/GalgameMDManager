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
        if (!(/^([a-zA-Z]:\\|\/)/.test(folderPath))) {
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
                allGamesBasicData = data.games.map(game => ({ // Ensure frontend structure
                    id: game.id || `unknown-id-${Math.random().toString(36).substr(2, 9)}`,
                    title_display: game.title_display || '无标题',
                    title_original: game.title_original || '无标题',
                    names: game.names || { japanese: null, english: null, chinese: null, aliases: [] },
                    cover_image: game.cover_image || null,
                    info: game.info || { developer: null, release_date: null, duration_tier: "未知时长", duration_hours: null, platforms: [], related_works: [] },
                    developer: game.info?.developer || null,
                    release_date: game.info?.release_date || null,
                    duration_tier: game.info?.duration_tier || '未知时长',
                    duration_hours: game.info?.duration_hours === undefined ? null : game.info?.duration_hours,
                    platforms: game.info?.platforms || [],
                    series_name: game.series_name || null,
                    series_tag: game.series_tag || null,
                    description: game.description || null,
                    screenshots: game.screenshots || [],
                    download_links: game.download_links || [],
                    source_filename: game.source_filename || null,
                    abbrlink: game.abbrlink || null,
                    parse_error: game.parse_error || false,
                    parse_warning: game.parse_warning || null,
                }));

                let statusMsg = "";
                if (allGamesBasicData.length > 0) {
                    populateFilterOptions(allGamesBasicData);
                    applyFiltersAndSort();
                    statusMsg = `成功加载 ${allGamesBasicData.length} 个游戏。`;
                    if (data.warnings && data.warnings.length > 0) {
                        statusMsg += ` <span title="${data.warnings.join('\n')}">(${data.warnings.length}条解析警告)</span>`;
                    }
                    setStatus(statusMsg, 'success');
                    disableFiltersAndSearch(false);
                } else {
                    gamesListDiv.innerHTML = '';
                    setStatus(data.message || '未找到 .md 文件或文件夹中无内容。', 'info', true);
                    disableFiltersAndSearch(true);
                }
            } else {
                gamesListDiv.innerHTML = '';
                setStatus('响应数据格式不正确或未包含游戏列表。', 'info', true);
                disableFiltersAndSearch(true);
            }
        } catch (error) {
            console.error('加载游戏失败:', error);
            gamesListDiv.innerHTML = '';
            let errorMsg = `错误: ${error.message || '未知错误'}`;
            if (!isUserInitiated) { // If auto-load fails
                errorMsg += ` (自动加载上次路径失败). 请检查路径或手动加载。`;
                folderPathContainer.classList.add('visible'); // Show path input on auto-load fail
            }
            setStatus(errorMsg, 'error', true);
            disableFiltersAndSearch(true);
        } finally {
            loadGamesBtn.disabled = false;
        }
    }

    async function fetchGameDetails(gameId) { // Remains mostly for direct access if needed
        const game = allGamesBasicData.find(g => g.id === gameId);
        if (game) return Promise.resolve(game);
        console.warn(`Game with ID ${gameId} not found in client cache. This shouldn't happen if all data is pre-loaded.`);
        // Fallback to API (should ideally not be hit if /api/games_basic sends all)
        try {
            const response = await fetch(`http://127.0.0.1:7500/api/game_details/${gameId}`);
            if (!response.ok) throw new Error(`服务器错误: ${response.status}`);
            return await response.json();
        } catch (apiError) {
            throw new Error(`游戏详情 (ID: ${gameId}) 获取失败: ${apiError.message}`);
        }
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
        } else {
             setStatus('请先加载资源。', 'info', true); // Or previous permanent message
        }
    }

    function applyFiltersAndSort() {
        let filtered = [...allGamesBasicData];
        // currentSearchTerm is used for filtering, searchInput.value is just for display
        const searchTermToUse = currentSearchTerm;
        const selectedDev = filterDeveloperSelect.value;
        const selectedDuration = filterDurationTierSelect.value;
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
                return searchFields.some(field => field && field.toLowerCase().includes(searchTermToUse));
            });
        }
        if (selectedDev) filtered = filtered.filter(game => game.developer === selectedDev);
        if (selectedDuration) filtered = filtered.filter(game => game.info?.duration_tier === selectedDuration);
        if (selectedSeries) filtered = filtered.filter(game => game.series_name === selectedSeries);

        const [sortField, sortDirection] = sortValue.split('_');
        const asc = sortDirection === 'asc';
        filtered.sort((a, b) => {
            let valA, valB;
            if (sortField === 'release_date') {
                valA = a.info?.release_date; valB = b.info?.release_date;
                const dateA = valA ? new Date(String(valA).replace(/\./g, '-')) : null;
                const dateB = valB ? new Date(String(valB).replace(/\./g, '-')) : null;
                if (!dateA && !dateB) return 0; if (!dateA) return asc ? 1 : -1;
                if (!dateB) return asc ? -1 : 1; return asc ? dateA - dateB : dateB - dateA;
            } else if (sortField === 'duration_hours') {
                valA = a.info?.duration_hours; valB = b.info?.duration_hours;
                valA = (valA === null || valA === undefined) ? (asc ? Infinity : -Infinity) : parseFloat(valA);
                valB = (valB === null || valB === undefined) ? (asc ? Infinity : -Infinity) : parseFloat(valB);
                return asc ? valA - valB : valB - valA;
            } else {
                valA = (a[sortField] || '').toString().toLowerCase();
                valB = (b[sortField] || '').toString().toLowerCase();
                if (valA < valB) return asc ? -1 : 1; if (valA > valB) return asc ? 1 : -1;
                return 0;
            }
        });

        currentFilteredAndSortedGames = filtered;
        currentPage = 1;
        renderPage();

        if (statusMessageDiv.dataset.permanent !== "true") {
            if (allGamesBasicData.length > 0) {
                if (filtered.length === 0) {
                     setStatus('没有符合当前筛选条件的游戏。', 'info');
                } else if (searchTermToUse || selectedDev || selectedDuration || selectedSeries || showOnlyFavorites) {
                     setStatus(`筛选出 ${filtered.length} 个游戏。`, 'info');
                } else {
                     const currentStatusType = statusMessageDiv.classList.contains('success') ? 'success' : 'info';
                     setStatus(`显示 ${allGamesBasicData.length} 个游戏。`, currentStatusType); // Show total if no filters
                }
            } else if (!statusMessageDiv.textContent.includes("错误") && !statusMessageDiv.textContent.includes("加载资源")) {
                setStatus('', 'info');
            }
        }
    }

    function populateFilterOptions(games) {
        const developers = new Set();
        const seriesNames = new Set();
        games.forEach(game => {
            if (game.developer) developers.add(game.developer);
            if (game.series_name) seriesNames.add(game.series_name);
        });
        populateSelect(filterDeveloperSelect, developers, "所有开发商");
        populateSelect(filterSeriesSelect, seriesNames, "所有系列");
    }

    function populateSelect(selectElement, optionsSet, defaultOptionText, forceClear = false) {
        const currentValue = selectElement.value;
        if (forceClear) selectElement.innerHTML = `<option value="">${defaultOptionText}</option>`;
        const sortedOptions = Array.from(optionsSet).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        sortedOptions.forEach(optionValue => {
            if (forceClear || !Array.from(selectElement.options).find(opt => opt.value === optionValue)) {
                const option = document.createElement('option');
                option.value = optionValue; option.textContent = optionValue;
                selectElement.appendChild(option);
            }
        });
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
        if (!query || !text) return text;
        // Escape regex special characters in query
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedQuery})`, 'gi');
        return text.replace(regex, '<mark class="search-highlight">$1</mark>');
    }

    function displayGamesForCurrentPage() {
        gamesListDiv.innerHTML = '';
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const gamesToDisplay = currentFilteredAndSortedGames.slice(startIndex, endIndex);

        if (gamesToDisplay.length === 0) {
            if (allGamesBasicData.length > 0 && currentFilteredAndSortedGames.length === 0) {
                // This means filters resulted in zero games, status is handled by applyFiltersAndSort
            } else if (allGamesBasicData.length === 0 && statusMessageDiv.dataset.permanent !== "true"){
                // No games loaded at all, status handled by handleLoadGames or initializeApp
            }
            return;
        }

        gamesToDisplay.forEach(game => {
            const card = document.createElement('div');
            card.classList.add('game-card');
            if (game.parse_error) card.classList.add('parse-error-card');
            if (game.parse_warning) card.classList.add('parse-warning-card');


            const favButton = document.createElement('button');
            favButton.classList.add('favorite-btn');
            favButton.dataset.gameId = game.id || '';
            const isFav = favorites.has(game.id);
            favButton.classList.toggle('is-favorite', isFav);
            favButton.innerHTML = isFav ? SVG_BOOKMARK_FILLED : SVG_BOOKMARK_OUTLINE;
            favButton.title = isFav ? "取消收藏" : "添加到收藏";
            favButton.setAttribute('aria-pressed', isFav.toString());
            favButton.addEventListener('click', (e) => { e.stopPropagation(); toggleFavorite(game.id); });
            card.appendChild(favButton);

            let indicatorHtml = '';
            if (game.parse_error) {
                indicatorHtml = `<span class="parse-indicator parse-error-indicator" title="文件 '${game.source_filename}' 解析时遇到严重问题。详情请查看弹窗。">${SVG_ERROR_ICON}</span>`;
            } else if (game.parse_warning) {
                 indicatorHtml = `<span class="parse-indicator parse-warning-indicator" title="文件 '${game.source_filename}' 解析时存在警告 (如ID冲突)。">${SVG_WARNING_ICON}</span>`;
            }
            if(indicatorHtml) card.insertAdjacentHTML('beforeend', indicatorHtml);


            const coverWrapper = document.createElement('div');
            coverWrapper.classList.add('game-cover-wrapper');
            const coverImg = document.createElement('img');
            coverImg.classList.add('game-cover');
            coverImg.alt = `${game.title_display || '游戏'} 封面`;
            const placeholder = document.createElement('span');
            placeholder.classList.add('game-cover-placeholder');
            coverWrapper.appendChild(placeholder);
            if (game.cover_image) {
                coverImg.dataset.src = game.cover_image;
                observeElementForLazyLoad(coverImg);
                coverWrapper.insertBefore(coverImg, placeholder);
                placeholder.textContent = '封面加载中...'; placeholder.style.display = 'flex';
            } else {
                placeholder.textContent = game.parse_error ? '信息不足' : '无封面';
                placeholder.style.display = 'flex';
            }

            const cardContent = document.createElement('div');
            cardContent.classList.add('game-card-content');
            let seriesTagHtml = '';
            if (game.series_name) {
                seriesTagHtml = `<p class="game-series-tag-card">${highlightText(game.series_name, currentSearchTerm)}${game.series_tag ? ` <small>(${game.series_tag})</small>` : ''}</p>`;
            }
            const platforms = game.info?.platforms;
            let platformsHtml = '';
            if (platforms && Array.isArray(platforms) && platforms.length > 0) {
                platformsHtml = `<p class="game-platforms-card">平台: ${platforms.join(', ')}</p>`;
            }
            const displayTitle = game.title_display || (game.parse_error ? '解析错误' : '无标题');
            const highlightedTitle = highlightText(displayTitle, currentSearchTerm);

            cardContent.innerHTML = `
                <div class="game-info-bar">
                    <span class="duration-capsule">${game.info?.duration_tier || '未知'}</span>
                    ${game.info?.release_date ? `<span class="game-release-date-card">${game.info.release_date}</span>` : ''}
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
                if (game.id) {
                    detailsButton.addEventListener('click', (e) => {
                        const gameId = e.target.dataset.gameId; if (gameId) openGameDetailModal(gameId);
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
        const elementTop = gamesListDiv.getBoundingClientRect().top + window.pageYOffset - headerHeight - 15;
        window.scrollTo({ top: elementTop < 0 ? 0 : elementTop, behavior: 'smooth' });
    }

    async function openGameDetailModal(gameId) {
        if (!gameId) return;
        gameDetailModal.style.display = 'block'; document.body.style.overflow = 'hidden';
        modalBody.innerHTML = ''; modalLoader.style.display = 'block';
        const existingHeader = gameDetailModal.querySelector('.modal-header');
        if (existingHeader) existingHeader.remove();
        try {
            const game = await fetchGameDetails(gameId); renderGameDetailsToModal(game);
        } catch (error) {
            modalBody.innerHTML = `<p class="error" style="color: red; text-align: center;">加载游戏详情失败: ${error.message || '未知错误'}</p>`;
            console.error("Error fetching/rendering game details:", error);
        } finally {
            modalLoader.style.display = 'none';
        }
    }

    function renderGameDetailsToModal(game) {
        const modalContentDiv = gameDetailModal.querySelector('.modal-content');
        if (!modalContentDiv) return;

        let displayTitle = game.title_original || '无标题';
        if (game.names?.chinese) displayTitle = game.names.chinese;
        else if (game.names?.english) displayTitle = game.names.english;
        else if (game.names?.japanese) displayTitle = game.names.japanese;

        const modalHeader = document.createElement('div'); modalHeader.classList.add('modal-header');
        const modalTitleH2 = document.createElement('h2'); modalTitleH2.id = 'modalTitle';
        modalTitleH2.innerHTML = highlightText(displayTitle, currentSearchTerm); // Use currentSearchTerm for consistency
        modalHeader.appendChild(modalTitleH2);
        const closeBtn = document.createElement('button'); closeBtn.classList.add('close-button');
        closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
        closeBtn.setAttribute('aria-label', '关闭详情'); closeBtn.onclick = closeGameDetailModal;
        modalHeader.appendChild(closeBtn);
        modalContentDiv.insertBefore(modalHeader, modalBody);

        const buildSection = (title, content) => content && content.trim() !== '' && content.trim() !== '<ul></ul>' ? `<div class="modal-section"><h3>${title}</h3>${content}</div>` : '';
        let namesHtml = '';
        if (game.names) {
            if (game.names.japanese && game.names.japanese !== displayTitle) namesHtml += `<p><strong>日文名：</strong> ${highlightText(game.names.japanese, currentSearchTerm)}</p>`;
            if (game.names.english && game.names.english !== displayTitle) namesHtml += `<p><strong>英文名：</strong> ${highlightText(game.names.english, currentSearchTerm)}</p>`;
            if (game.names.chinese && game.names.chinese !== displayTitle) namesHtml += `<p><strong>中文名：</strong> ${highlightText(game.names.chinese, currentSearchTerm)}</p>`;
            if (game.names.aliases && game.names.aliases.length > 0) namesHtml += `<p><strong>别名：</strong> <span class="aliases">${game.names.aliases.map(a => highlightText(a, currentSearchTerm)).join(', ')}</span></p>`;
        }
        let infoHtml = '';
        if (game.info) {
            if (game.info.developer) infoHtml += `<p><strong>开发商：</strong> ${highlightText(game.info.developer, currentSearchTerm)}</p>`;
            if (game.info.release_date) infoHtml += `<p><strong>发售日期：</strong> ${game.info.release_date}</p>`;
            if (game.info.duration_str) infoHtml += `<p><strong>时长：</strong> ${game.info.duration_str}${game.info.duration_tier && game.info.duration_tier !== "未知时长" ? ` (${game.info.duration_tier})` : ''}</p>`;
            if (game.info.platforms && game.info.platforms.length > 0) infoHtml += `<p><strong>平台：</strong> ${game.info.platforms.join(', ')}</p>`;
        }
        if (game.series_name) infoHtml += `<p><strong>系列：</strong> ${highlightText(game.series_name, currentSearchTerm)}${game.series_tag ? ` (${game.series_tag})` : ''}</p>`;
        if (game.info?.related_works && game.info.related_works.length > 0) {
            infoHtml += `<p><strong>相关作品：</strong></p><ul>`;
            game.info.related_works.forEach(work => { infoHtml += `<li>${work.type}： ${work.name}</li>`; }); infoHtml += `</ul>`;
        }
        let descriptionHtml = '';
        let errorWarningMessages = '';
        if (game.parse_error) errorWarningMessages += `<p class="error-message"><strong>严重错误：</strong> 此游戏元数据解析失败。源文件: ${game.source_filename}</p>`;
        if (game.parse_warning) errorWarningMessages += `<p class="warning-message"><strong>警告：</strong> ${game.parse_warning} (源文件: ${game.source_filename})</p>`;

        if (game.description) descriptionHtml = `<p>${game.description.replace(/\n/g, '<br>')}</p>`;
        else if (!game.parse_error) descriptionHtml = `<p>暂无简介。</p>` // Only show if not a parse error already explaining missing data

        let screenshotsHtml = '';
        if (game.screenshots && game.screenshots.length > 0) {
            screenshotsHtml = '<div class="modal-screenshots">';
            game.screenshots.filter(ss => ss).forEach(ssUrl => { screenshotsHtml += `<div class="modal-screenshot-item"><img src="${ssUrl}" alt="截图" loading="lazy" onclick="window.open('${ssUrl}', '_blank', 'noopener,noreferrer')" tabindex="0" role="button"></div>`; });
            screenshotsHtml += '</div>';
        }
        let downloadsHtml = '<ul>';
        if (game.download_links && game.download_links.length > 0) {
            game.download_links.forEach(link => {
                downloadsHtml += `<li><a href="${link.url || '#'}" target="_blank" rel="noopener noreferrer">${link.name || '下载链接'}</a>`;
                if (link.password) {
                    const passwordId = `pw-${game.id}-${generateSimpleId(link.name)}`;
                    downloadsHtml += ` <span class="password-info">(密码: <span id="${passwordId}" class="password-text">${link.password}</span> <button class="copy-password-btn" data-clipboard-target="#${passwordId}" title="复制密码">${SVG_COPY_ICON} <span>复制</span></button>)</span>`;
                }
                downloadsHtml += `</li>`;
            });
        } else downloadsHtml += '<li>暂无下载链接。</li>';
        downloadsHtml += '</ul>';

        modalBody.innerHTML = `
            ${game.cover_image ? `<img src="${game.cover_image}" alt="${displayTitle}封面" class="modal-cover-image" loading="lazy">` : ''}
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
        return str.replace(/[^a-zA-Z0-9]/g, '').substring(0,10) + Math.random().toString(36).substr(2, 5);
    }

    function copyPasswordToClipboard(buttonElement) {
        const targetSelector = buttonElement.dataset.clipboardTarget;
        const passwordSpan = document.querySelector(targetSelector);
        if (passwordSpan && navigator.clipboard) {
            navigator.clipboard.writeText(passwordSpan.textContent)
                .then(() => {
                    const originalText = buttonElement.querySelector('span').textContent;
                    buttonElement.querySelector('span').textContent = '已复制!'; buttonElement.disabled = true;
                    setTimeout(() => { buttonElement.querySelector('span').textContent = originalText; buttonElement.disabled = false; }, 1500);
                }).catch(err => { console.error('无法复制密码: ', err); alert('复制失败。'); });
        } else alert('您的浏览器不支持自动复制。');
    }

    function closeGameDetailModal() {
        if (gameDetailModal.style.display === 'block') {
            gameDetailModal.style.display = 'none'; document.body.style.overflow = 'auto';
            const existingHeader = gameDetailModal.querySelector('.modal-header');
            if (existingHeader) existingHeader.remove(); modalBody.innerHTML = '';
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
                                console.warn(`Failed to load image: ${src}`); img.style.display = 'none';
                                if (placeholder) { placeholder.textContent = '图片加载失败'; placeholder.style.display = 'flex'; }
                            };
                        } else if (placeholder) {
                            placeholder.textContent = placeholder.dataset.defaultText || '无封面'; placeholder.style.display = 'flex';
                        }
                        observer.unobserve(img);
                    }
                });
            }, { rootMargin: "0px 0px 200px 0px" });
        }
        return lazyLoadObserver;
    }
    function observeElementForLazyLoad(element) { getLazyLoadObserver().observe(element); }

    // --- Start the application ---
    initializeApp();
});
