// Global Database Integration for CineShelf v4
class CineShelfGlobal {
    constructor() {
        this.apiUrl = './php/global-db.php';
        this.userId = localStorage.getItem('cineshelf_user_id');
        this.isOnline = navigator.onLine;
        
        // Listen for online/offline events
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.syncPendingChanges();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
        });
    }
    
    async initUser() {
        if (!this.userId) {
            try {
                const response = await fetch(`${this.apiUrl}/init`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        display_name: 'Movie Collector'
                    })
                });
                
                const result = await response.json();
                if (result.user_id) {
                    this.userId = result.user_id;
                    localStorage.setItem('cineshelf_user_id', this.userId);
                }
                return result;
            } catch (error) {
                console.log('Global DB unavailable, using local storage');
                return null;
            }
        }
        return { user_id: this.userId };
    }
    
    async addMovie(movieData) {
        // Always save locally first
        const localMovies = JSON.parse(localStorage.getItem('movies') || '[]');
        localMovies.push({ ...movieData, localId: Date.now() });
        localStorage.setItem('movies', JSON.stringify(localMovies));
        
        // Try to sync to global database
        if (this.isOnline && this.userId) {
            try {
                const response = await fetch(`${this.apiUrl}/movies`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-User-ID': this.userId
                    },
                    body: JSON.stringify(movieData)
                });
                
                const result = await response.json();
                if (result.success) {
                    // Mark as synced
                    movieData.globalId = result.global_movie_id;
                    movieData.synced = true;
                    localStorage.setItem('movies', JSON.stringify(localMovies));
                }
                
                return result;
            } catch (error) {
                // Store for later sync
                this.storePendingChange('add', movieData);
                return { success: true, message: 'Saved locally, will sync when online' };
            }
        }
        
        return { success: true, message: 'Saved locally' };
    }
    
    async discoverMovies(filters = {}) {
        if (!this.isOnline || !this.userId) {
            return { error: 'Discovery requires online connection' };
        }
        
        try {
            const params = new URLSearchParams(filters);
            const response = await fetch(`${this.apiUrl}/discover?${params}`, {
                headers: { 'X-User-ID': this.userId }
            });
            
            return await response.json();
        } catch (error) {
            return { error: 'Failed to discover movies' };
        }
    }
    
    async getPopularMovies(limit = 20) {
        if (!this.isOnline) {
            return [];
        }
        
        try {
            const response = await fetch(`${this.apiUrl}/popular?limit=${limit}`);
            return await response.json();
        } catch (error) {
            return [];
        }
    }
    
    storePendingChange(action, data) {
        const pending = JSON.parse(localStorage.getItem('pending_sync') || '[]');
        pending.push({ action, data, timestamp: Date.now() });
        localStorage.setItem('pending_sync', JSON.stringify(pending));
    }
    
    async syncPendingChanges() {
        const pending = JSON.parse(localStorage.getItem('pending_sync') || '[]');
        const synced = [];
        
        for (const change of pending) {
            try {
                if (change.action === 'add') {
                    await this.addMovie(change.data);
                    synced.push(change);
                }
            } catch (error) {
                console.log('Failed to sync change:', error);
            }
        }
        
        // Remove synced changes
        const remaining = pending.filter(change => !synced.includes(change));
        localStorage.setItem('pending_sync', JSON.stringify(remaining));
    }
}

// Initialize global database integration
const globalDB = new CineShelfGlobal();
globalDB.initUser();

// CineShelf App - Main JavaScript File
// Global App object to contain all functions
window.App = (function() {
    // API Configuration
    const TMDB_API_KEY = '8039283176a74ffd71a1658c6f84a051';
    const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
    const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
    
    // UI Constants
    const SEARCH_DEBOUNCE_MS = 300;
    const SETTINGS_UPDATE_DELAY_MS = 50;
    const INIT_DELAY_MS = 200;
    const MODAL_TRANSITION_MS = 300;
    const STATUS_DISPLAY_MS = 5000;
    
    // Default Settings Template
    const DEFAULT_SETTINGS = {
        searchResultsLimit: 10,
        defaultViewMode: 'grid',
        autoResolve: false,
        barcodeBeep: true,
        scannerVibration: true,
        debugMode: false,
        autoBackup: false,
        compactMode: false,
        appTheme: 'cosmic',
        animationSpeed: 'normal',
        cardStyle: 'rounded',
        openaiApiKey: '',
        tmdbApiKey: ''
    };

    // Default Edition Options
    const DEFAULT_EDITIONS = [
        'Standard',
        'Widescreen',
        'Full Screen', 
        'Special Edition',
        'Director\'s Cut',
        'Extended Edition',
        'Collector\'s Edition',
        'Limited Edition',
        'Anniversary Edition',
        'Criterion Collection',
        'Unrated',
        'Theatrical Cut'
    ];
    
    // Storage Keys
    const STORAGE_KEYS = {
        copies: (user) => `cineshelf_copies_${user}`,
        movies: (user) => `cineshelf_movies_${user}`,
        settings: 'cineshelf_settings',
        users: 'cineshelf_users',
        currentUser: 'cineshelf_current_user',
        sort: 'cineshelf_sort',
        view: 'cineshelf_view',
        lastBackup: (user) => `cineshelf_last_backup_${user}`,
        safetyBackup: (user) => `cineshelf_safety_backup_${user}`,
        customEditions: 'cineshelf_custom_editions'
    };

    let copies = [];
    let movies = [];
    let currentResolveItem = null;
    let currentEditItem = null;
    let skippedResolveItems = [];
    let currentUser = 'default';
    let users = ['default'];
    let customEditions = [];
    let currentSort = {
        collection: 'title',
        wishlist: 'title'
    };
    let currentView = {
        collection: 'grid',
        wishlist: 'grid'
    };
    
    // Application settings - use spread to avoid reference issues
    let settings = { ...DEFAULT_SETTINGS };

    // Utility Functions
    function debugLog(message, data = null) {
        if (settings.debugMode) {
            console.log(`CineShelf Debug: ${message}`, data || '');
        }
    }

    function validateImdbId(id) {
        return typeof id === 'string' && /^tt\d{7,8}$/.test(id);
    }

    function validateMovieTitle(title) {
        return typeof title === 'string' && title.trim().length > 0 && title.trim().length <= 200;
    }

    function sanitizeInput(input) {
        if (typeof input !== 'string') return '';
        return input.trim().replace(/[<>]/g, '');
    }

    function safeJsonParse(jsonString, fallback = null) {
        try {
            return JSON.parse(jsonString);
        } catch (error) {
            debugLog(`JSON parse error: ${error.message}`);
            return fallback;
        }
    }

    function showStatus(message, type, duration = STATUS_DISPLAY_MS) {
        const status = document.getElementById('status');
        if (!status) return;
        
        status.textContent = sanitizeInput(message);
        status.className = `status ${type} show`;
        status.style.display = 'block';
        
        setTimeout(() => {
            status.classList.remove('show');
            status.style.display = 'none';
        }, duration);
    }

    // Edition Management Functions
    function loadCustomEditions() {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.customEditions);
            if (saved) {
                customEditions = JSON.parse(saved);
            }
        } catch (error) {
            console.error('Error loading custom editions:', error);
            customEditions = [];
        }
    }

    function saveCustomEditions() {
        try {
            localStorage.setItem(STORAGE_KEYS.customEditions, JSON.stringify(customEditions));
        } catch (error) {
            console.error('Error saving custom editions:', error);
        }
    }

    function getAllEditions() {
        const allEditions = [...DEFAULT_EDITIONS, ...customEditions];
        return [...new Set(allEditions)].sort();
    }

    function addCustomEdition(newEdition) {
        if (!newEdition || typeof newEdition !== 'string') return false;
        
        const trimmed = newEdition.trim();
        if (trimmed.length === 0 || trimmed.length > 50) return false;
        
        const allEditions = getAllEditions();
        if (allEditions.some(edition => edition.toLowerCase() === trimmed.toLowerCase())) {
            return false; // Already exists
        }
        
        customEditions.push(trimmed);
        saveCustomEditions();
        updateEditionDropdown();
        return true;
    }

    function updateEditionDropdown() {
        const editionSelect = document.getElementById('edition');
        if (!editionSelect) return;
        
        const currentValue = editionSelect.value;
        const allEditions = getAllEditions();
        
        // Clear and rebuild options
        editionSelect.innerHTML = '<option value="">Select Edition (Optional)</option>';
        
        allEditions.forEach(edition => {
            const option = document.createElement('option');
            option.value = edition;
            option.textContent = edition;
            editionSelect.appendChild(option);
        });
        
        // Add "Add Custom..." option
        const customOption = document.createElement('option');
        customOption.value = '__ADD_CUSTOM__';
        customOption.textContent = '+ Add Custom Edition...';
        customOption.style.fontStyle = 'italic';
        customOption.style.color = '#666';
        editionSelect.appendChild(customOption);
        
        // Restore previous value if it still exists
        if (currentValue && allEditions.includes(currentValue)) {
            editionSelect.value = currentValue;
        }
    }

    function displayCustomEditions() {
        const container = document.getElementById('customEditionsList');
        if (!container) return;
        
        if (customEditions.length === 0) {
            container.innerHTML = '<div style="color: rgba(255,255,255,0.7); font-style: italic; text-align: center; padding: 1rem;">No custom editions added yet</div>';
            return;
        }
        
        container.innerHTML = '';
        
        customEditions.forEach((edition, index) => {
            const editionDiv = document.createElement('div');
            editionDiv.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 0.5rem;
                margin-bottom: 0.5rem;
                background: rgba(255,255,255,0.1);
                border-radius: 6px;
                border: 1px solid rgba(255,255,255,0.2);
            `;
            
            editionDiv.innerHTML = `
                <span style="color: white; flex: 1;">${edition}</span>
                <button onclick="App.removeCustomEdition('${edition}')" 
                        style="background: #dc3545; color: white; border: none; padding: 0.25rem 0.5rem; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">
                    Remove
                </button>
            `;
            
            container.appendChild(editionDiv);
        });
    }

    function addCustomEditionFromSettings() {
        const input = document.getElementById('newCustomEdition');
        if (!input) return;
        
        const newEdition = input.value.trim();
        if (!newEdition) {
            showStatus('Please enter an edition name', 'error');
            return;
        }
        
        const success = addCustomEdition(newEdition);
        if (success) {
            input.value = '';
            displayCustomEditions();
            showStatus(`Added custom edition: ${newEdition}`, 'success');
        } else {
            showStatus('Edition already exists or invalid name', 'error');
        }
    }

    function removeCustomEdition(editionToRemove) {
        if (!editionToRemove) return;
        
        // Check if this edition is used in any existing copies
        const usedInCopies = copies.some(copy => copy.edition === editionToRemove);
        
        if (usedInCopies) {
            const confirmMessage = `"${editionToRemove}" is currently used in your collection.\n\nRemoving it will NOT affect existing movies, but it won't appear in the dropdown for new movies.\n\nContinue?`;
            if (!confirm(confirmMessage)) {
                return;
            }
        }
        
        // Remove from custom editions array
        customEditions = customEditions.filter(edition => edition !== editionToRemove);
        
        // Save and update UI
        saveCustomEditions();
        updateEditionDropdown();
        displayCustomEditions();
        
        showStatus(`Removed custom edition: ${editionToRemove}`, 'success');
    }

    function resetCustomEditions() {
        if (!confirm('This will remove ALL custom editions and keep only the default ones.\n\nExisting movies will keep their edition names, but custom editions will no longer appear in the dropdown.\n\nContinue?')) {
            return;
        }
        
        customEditions = [];
        saveCustomEditions();
        updateEditionDropdown();
        displayCustomEditions();
        
        showStatus('Reset to default editions only', 'success');
    }

    function handleEditionChange() {
        const editionSelect = document.getElementById('edition');
        if (!editionSelect) return;
        
        if (editionSelect.value === '__ADD_CUSTOM__') {
            const customEdition = prompt('Enter custom edition name:');
            if (customEdition && customEdition.trim()) {
                const success = addCustomEdition(customEdition.trim());
                if (success) {
                    editionSelect.value = customEdition.trim();
                    showStatus(`Added custom edition: ${customEdition.trim()}`, 'success');
                } else {
                    showStatus('Edition already exists or invalid name', 'error');
                    editionSelect.value = '';
                }
            } else {
                editionSelect.value = '';
            }
        }
    }
    
    function init() {
        loadData();
        loadCustomEditions();
        updateUI();
        setupEventListeners();
        
        // Setup edition dropdown
        updateEditionDropdown();
        
        // Ensure settings UI is properly initialized after a short delay
        setTimeout(() => {
            if (settings.debugMode) {
                console.log('CineShelf Debug: Initializing Settings UI');
            }
            updateSettingsUI();
        }, 200);
        
        // Auto-resolve movies from shared database
        setTimeout(loadUnresolvedMoviesFromServer, 1000);
    }

    function setupEventListeners() {
        const searchBtn = document.getElementById('searchBtn');
        const imdbBtn = document.getElementById('imdbBtn');
        const movieForm = document.getElementById('movieForm');
        const movieTitle = document.getElementById('movieTitle');
        const imdbId = document.getElementById('imdbId');
        const editionSelect = document.getElementById('edition');
        
        if (searchBtn) {
            searchBtn.addEventListener('click', searchMovies);
        }
        
        if (imdbBtn) {
            imdbBtn.addEventListener('click', lookupByImdbId);
            console.log('CineShelf: IMDB button event listener attached');
        } else {
            console.error('CineShelf: IMDB button not found!');
        }
        
        if (movieForm) {
            movieForm.addEventListener('submit', handleFormSubmit);
        }

        if (editionSelect) {
            editionSelect.addEventListener('change', handleEditionChange);
        }
        
        // Clear the other field when typing in one
        if (movieTitle) {
            movieTitle.addEventListener('input', function() {
                if (this.value.trim() && imdbId) {
                    imdbId.value = '';
                }
            });
        }
        
        if (imdbId) {
            imdbId.addEventListener('input', function() {
                if (this.value.trim() && movieTitle) {
                    movieTitle.value = '';
                }
            });
        }
        
        // Close modals when clicking outside
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('modal')) {
                e.target.classList.remove('active');
            }
        });
    }

    function switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[onclick="switchTab('${tabName}')"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabName).classList.add('active');

        // Update content based on tab
        if (tabName === 'collection') {
            document.getElementById('collectionSort').value = currentSort.collection;
            updateViewButtons('collection');
            displayMovies('collection');
        } else if (tabName === 'wishlist') {
            document.getElementById('wishlistSort').value = currentSort.wishlist;
            updateViewButtons('wishlist');
            displayMovies('wishlist');
        } else if (tabName === 'covers') {
            // Update cover scanner with stored API key
            if (window.CoverScanner && window.CoverScanner.updateApiKeyFromSettings) {
                setTimeout(() => window.CoverScanner.updateApiKeyFromSettings(), 100);
            }
        } else if (tabName === 'resolve') {
            displayUnresolvedItems();
        } else if (tabName === 'data') {
            updateStats();
            updateUserDropdown();
        } else if (tabName === 'settings') {
            // Add a small delay to ensure DOM elements are ready
            setTimeout(() => {
                updateSettingsUI();
                displayCustomEditions();
            }, 50);
        } else if (tabName === 'scan') {
            updateResolveNextSection();
            updateEditSection();
            updateEditionDropdown(); // Refresh edition dropdown when going to scan tab
        }

        // Update admin permissions when switching tabs
        if (window.AdminManager) {
            setTimeout(() => AdminManager.updateUIPermissions(), 100);
        }
    }

    function updateViewButtons(type) {
        const container = document.getElementById(type).querySelector('.view-toggle');
        container.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
        
        const currentMode = currentView[type] || 'grid';
        const buttons = container.querySelectorAll('.view-btn');
        buttons.forEach(btn => {
            const onclick = btn.getAttribute('onclick');
            if (onclick && onclick.includes(`'${currentMode}'`)) {
                btn.classList.add('active');
            }
        });
    }

    async function searchMovies() {
        const title = document.getElementById('movieTitle').value.trim();
        if (!title) return;

        const btn = document.getElementById('searchBtn');
        const btnText = document.getElementById('searchBtnText');
        const loader = document.getElementById('searchLoader');

        btn.disabled = true;
        btnText.style.display = 'none';
        loader.style.display = 'inline-block';

        try {
            const response = await fetch(`${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`);
            const data = await response.json();

            if (data.results && data.results.length > 0) {
                displaySearchResults(data.results);
                document.getElementById('searchModal').classList.add('active');
            } else {
                showStatus('No movies found. You can still add the title as-is.', 'error');
            }
        } catch (error) {
            console.error('Search error:', error);
            showStatus('Search failed. You can still add the title as-is.', 'error');
        } finally {
            btn.disabled = false;
            btnText.style.display = 'inline';
            loader.style.display = 'none';
        }
    }

    async function lookupByImdbId() {
        console.log('CineShelf: IMDB lookup button clicked');
        
        const imdbId = document.getElementById('imdbId').value.trim();
        console.log('CineShelf: IMDB ID entered:', imdbId);
        
        if (!imdbId) {
            showStatus('Please enter an IMDB ID (e.g., tt0219965)', 'error');
            return;
        }

        // Validate IMDB ID format
        if (!/^tt\d{7,8}$/.test(imdbId)) {
            showStatus('Invalid IMDB ID format. Should be like: tt0219965', 'error');
            console.log('CineShelf: Invalid IMDB ID format:', imdbId);
            return;
        }

        const btn = document.getElementById('imdbBtn');
        const originalText = btn.textContent;
        
        btn.disabled = true;
        btn.textContent = 'Looking up...';
        
        console.log('CineShelf: Starting IMDB lookup for:', imdbId);

        try {
            // Convert IMDB ID to TMDB ID first
            const findUrl = `${TMDB_BASE_URL}/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
            console.log('CineShelf: Fetching from:', findUrl);
            
            const findResponse = await fetch(findUrl);
            const findData = await findResponse.json();
            
            console.log('CineShelf: TMDB find response:', findData);

            if (findData.movie_results && findData.movie_results.length > 0) {
                const movie = findData.movie_results[0];
                
                console.log('CineShelf: Found movie via IMDB ID:', movie);
                
                if (settings.debugMode) {
                    console.log(`CineShelf Debug: Found movie via IMDB ID ${imdbId}:`, movie);
                }
                
                // Get full movie details
                const detailsUrl = `${TMDB_BASE_URL}/movie/${movie.id}?api_key=${TMDB_API_KEY}&append_to_response=credits`;
                console.log('CineShelf: Fetching details from:', detailsUrl);
                
                const response = await fetch(detailsUrl);
                const details = await response.json();
                
                console.log('CineShelf: Movie details:', details);

                // Use the original IMDB ID instead of TMDB ID
                const movieData = {
                    imdbID: imdbId, // Use the provided IMDB ID
                    title: details.title,
                    year: details.release_date ? new Date(details.release_date).getFullYear() : null,
                    posterIMG: details.poster_path ? `${TMDB_IMAGE_BASE}${details.poster_path}` : '',
                    imdbRating: details.vote_average || 0,
                    plot: details.overview || '',
                    director: details.credits?.crew?.find(person => person.job === 'Director')?.name || 'Unknown',
                    genre: details.genres?.map(g => g.name).join(', ') || 'Unknown',
                    runtime: details.runtime ? `${details.runtime} min` : 'Unknown',
                    rated: 'Unknown'
                };

                console.log('CineShelf: Processed movie data:', movieData);

                // Add or update the movie in our collection
                const existingMovieIndex = movies.findIndex(m => m.imdbID === movieData.imdbID);
                if (existingMovieIndex === -1) {
                    movies.push(movieData);
                } else {
                    movies[existingMovieIndex] = movieData;
                }

                // Auto-fill the title field
                document.getElementById('movieTitle').value = movieData.title;

                // Handle resolve workflow
                handleMovieSelection(movieData);

                saveData();
                showStatus(`Found: ${movieData.title} (${movieData.year})`, 'success');

            } else {
                console.log('CineShelf: No movie found for IMDB ID:', imdbId);
                showStatus(`No movie found with IMDB ID: ${imdbId}`, 'error');
            }

        } catch (error) {
            console.error('CineShelf: IMDB lookup error:', error);
            showStatus('Failed to lookup movie by IMDB ID. Check your connection.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }

    function handleMovieSelection(movie) {
        if (currentResolveItem) {
            const copyIndex = copies.findIndex(c => c.id === currentResolveItem.id);
            if (copyIndex !== -1) {
                copies[copyIndex].movieId = movie.imdbID;
                copies[copyIndex].resolved = true;
                copies[copyIndex].title = movie.title;
                
                showStatus(`Resolved "${movie.title}"! Moving to next unresolved item...`, 'success');
                
                setTimeout(() => {
                    const remainingUnresolved = copies.filter(copy => !copy.resolved && copy.id !== currentResolveItem.id);
                    if (remainingUnresolved.length > 0) {
                        skipToNextUnresolved();
                    } else {
                        currentResolveItem = null;
                        updateResolveNextSection();
                        showStatus('All items resolved! 🎉', 'success');
                        document.getElementById('movieForm').reset();
                        document.getElementById('imdbId').value = '';
                        updateEditionDropdown();
                    }
                }, 1500);
            }
        }
    }

    function displaySearchResults(results) {
        const container = document.getElementById('searchResults');
        container.innerHTML = '';

        const limit = parseInt(settings.searchResultsLimit) || 10;
        const limitedResults = results.slice(0, limit);
        
        if (settings.debugMode) {
            console.log(`CineShelf Debug: Showing ${limitedResults.length} of ${results.length} search results (limit: ${limit})`);
        }

        limitedResults.forEach(movie => {
            const resultDiv = document.createElement('div');
            resultDiv.className = 'search-result';
            resultDiv.addEventListener('click', () => selectMovie(movie));

            const posterUrl = movie.poster_path 
                ? `${TMDB_IMAGE_BASE}${movie.poster_path}`
                : '';

            resultDiv.innerHTML = `
                <img src="${posterUrl}" alt="${movie.title}" class="search-poster" 
                     onerror="this.style.display='none'">
                <div class="search-info">
                    <div class="search-title">${movie.title}</div>
                    <div class="search-details">
                        ${movie.release_date ? new Date(movie.release_date).getFullYear() : 'Unknown'} • 
                        ⭐ ${movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A'}<br>
                        ${movie.overview ? movie.overview.substring(0, 100) + '...' : 'No description available'}
                    </div>
                </div>
            `;

            container.appendChild(resultDiv);
        });
    }

    async function selectMovie(tmdbMovie) {
        try {
            const response = await fetch(`${TMDB_BASE_URL}/movie/${tmdbMovie.id}?api_key=${TMDB_API_KEY}&append_to_response=credits`);
            const details = await response.json();

            const movie = {
                imdbID: tmdbMovie.id.toString(),
                title: details.title,
                year: details.release_date ? new Date(details.release_date).getFullYear() : null,
                posterIMG: details.poster_path ? `${TMDB_IMAGE_BASE}${details.poster_path}` : '',
                imdbRating: details.vote_average || 0,
                plot: details.overview || '',
                director: details.credits?.crew?.find(person => person.job === 'Director')?.name || 'Unknown',
                genre: details.genres?.map(g => g.name).join(', ') || 'Unknown',
                runtime: details.runtime ? `${details.runtime} min` : 'Unknown',
                rated: 'Unknown'
            };

            const existingMovieIndex = movies.findIndex(m => m.imdbID === movie.imdbID);
            if (existingMovieIndex === -1) {
                movies.push(movie);
            } else {
                movies[existingMovieIndex] = movie;
            }

            document.getElementById('movieTitle').value = movie.title;

            // Handle resolve workflow
            handleMovieSelection(movie);

            saveData();
            closeModal('searchModal');
            
            if (!currentResolveItem) {
                showStatus(`Selected: ${movie.title}`, 'success');
            }

        } catch (error) {
            console.error('Error fetching movie details:', error);
            showStatus('Error getting movie details, but you can continue.', 'error');
            closeModal('searchModal');
        }
    }

    function useWithoutData() {
        closeModal('searchModal');
        showStatus('You can add the movie without database information.', 'success');
    }

    function handleFormSubmit(e) {
        e.preventDefault();
        
        const isWishlist = e.submitter?.name === 'wishlist';
        const formData = {
            title: sanitizeInput(document.getElementById('movieTitle').value),
            format: document.getElementById('format').value || 'Unknown', // Default to 'Unknown' if no format selected
            region: document.getElementById('region').value,
            discs: parseInt(document.getElementById('discs').value) || 1,
            edition: document.getElementById('edition').value,
            languages: sanitizeInput(document.getElementById('languages').value),
            notes: sanitizeInput(document.getElementById('notes').value),
            upc: sanitizeInput(document.getElementById('upc').value)
        };

        // Validate required fields - REMOVED FORMAT REQUIREMENT
        if (!validateMovieTitle(formData.title)) {
            showStatus('Please enter a valid movie title (1-200 characters)', 'error');
            return;
        }

        // Validate disc count
        if (formData.discs < 1 || formData.discs > 50) {
            showStatus('Number of discs must be between 1 and 50', 'error');
            return;
        }

        // Check if we're editing an existing item
        if (currentEditItem) {
            // Update existing copy
            const copyIndex = copies.findIndex(c => c.id === currentEditItem.id);
            if (copyIndex !== -1) {
                copies[copyIndex] = {
                    ...copies[copyIndex],
                    title: formData.title,
                    format: formData.format,
                    region: formData.region,
                    discs: formData.discs,
                    edition: formData.edition,
                    languages: formData.languages,
                    notes: formData.notes,
                    upc: formData.upc,
                    isWishlist: isWishlist
                };
                
                saveData();
                currentEditItem = null;
                
                // Clear form and reset
                document.getElementById('movieForm').reset();
                document.getElementById('imdbId').value = '';
                updateEditionDropdown();
                updateEditSection();
                
                showStatus(`Updated "${formData.title}" successfully!`, 'success');
                switchTab(isWishlist ? 'wishlist' : 'collection');
                return;
            }
        }

        const matchingMovie = movies.find(m => 
            m.title.toLowerCase() === formData.title.toLowerCase()
        );

        const copy = {
            id: `copy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: formData.title,
            format: formData.format,
            region: formData.region,
            discs: formData.discs,
            edition: formData.edition,
            languages: formData.languages,
            notes: formData.notes,
            upc: formData.upc,
            isWishlist: isWishlist,
            movieId: matchingMovie ? matchingMovie.imdbID : null,
            resolved: !!matchingMovie,
            created: new Date().toISOString()
        };

        copies.push(copy);
        saveData();
        
        // Clear form and reset edition dropdown
        document.getElementById('movieForm').reset();
        document.getElementById('imdbId').value = '';
        updateEditionDropdown();
        
        showStatus(`Added "${copy.title}" to ${isWishlist ? 'wishlist' : 'collection'}`, 'success');
        switchTab(isWishlist ? 'wishlist' : 'collection');
    }

    function displayMovies(type) {
        const filteredCopies = copies.filter(copy => 
            type === 'collection' ? !copy.isWishlist : copy.isWishlist
        );

        const gridId = type + 'Grid';
        const emptyId = type + 'Empty';
        const grid = document.getElementById(gridId);
        const empty = document.getElementById(emptyId);

        if (filteredCopies.length === 0) {
            grid.innerHTML = '';
            grid.className = 'movie-grid';
            empty.style.display = 'block';
            return;
        }

        empty.style.display = 'none';
        
        const viewMode = currentView[type] || 'grid';
        
        grid.className = 'movie-grid';
        if (viewMode === 'detail') {
            grid.classList.add('detail-view');
        } else if (viewMode === 'list') {
            grid.classList.add('list-view');
        } else if (viewMode === 'small') {
            grid.classList.add('small-view');
        }
        
        const sortedCopies = sortCopies(filteredCopies, currentSort[type]);
        
        grid.innerHTML = '';

        sortedCopies.forEach(copy => {
            const movie = movies.find(m => m.imdbID === copy.movieId);
            const card = createMovieCard(copy, movie, type, viewMode);
            grid.appendChild(card);
        });
    }

    function sortCopies(copiesToSort, sortBy) {
        const copies = [...copiesToSort];
        
        const [field, direction] = sortBy.includes('-desc') 
            ? [sortBy.replace('-desc', ''), 'desc']
            : [sortBy, 'asc'];

        copies.sort((a, b) => {
            const movieA = movies.find(m => m.imdbID === a.movieId);
            const movieB = movies.find(m => m.imdbID === b.movieId);
            
            let valueA, valueB;

            switch (field) {
                case 'title':
                    valueA = a.title.toLowerCase();
                    valueB = b.title.toLowerCase();
                    break;
                case 'year':
                    valueA = movieA?.year || 0;
                    valueB = movieB?.year || 0;
                    break;
                case 'rating':
                    valueA = movieA?.imdbRating || 0;
                    valueB = movieB?.imdbRating || 0;
                    break;
                case 'runtime':
                    const extractMinutes = (runtime) => {
                        if (!runtime || runtime === 'Unknown') return 0;
                        const match = runtime.match(/(\d+)/);
                        return match ? parseInt(match[1]) : 0;
                    };
                    valueA = extractMinutes(movieA?.runtime);
                    valueB = extractMinutes(movieB?.runtime);
                    break;
                case 'director':
                    valueA = (movieA?.director || 'Unknown').toLowerCase();
                    valueB = (movieB?.director || 'Unknown').toLowerCase();
                    break;
                case 'genre':
                    valueA = (movieA?.genre || 'Unknown').toLowerCase();
                    valueB = (movieB?.genre || 'Unknown').toLowerCase();
                    break;
                case 'format':
                    valueA = a.format.toLowerCase();
                    valueB = b.format.toLowerCase();
                    break;
                case 'added':
                    valueA = new Date(a.created);
                    valueB = new Date(b.created);
                    break;
                default:
                    valueA = a.title.toLowerCase();
                    valueB = b.title.toLowerCase();
            }

            let comparison = 0;
            if (valueA < valueB) comparison = -1;
            if (valueA > valueB) comparison = 1;
            
            return direction === 'desc' ? -comparison : comparison;
        });

        return copies;
    }

    function sortMovies(type, sortBy) {
        currentSort[type] = sortBy;
        displayMovies(type);
        
        try {
            localStorage.setItem('cineshelf_sort', JSON.stringify(currentSort));
        } catch (error) {
            console.error('Error saving sort preference:', error);
        }
    }

    function createMovieCard(copy, movie, type, viewMode) {
        const card = document.createElement('div');
        card.className = 'movie-card';
        card.addEventListener('click', () => showMovieDetail(copy, movie));

        const posterUrl = movie?.posterIMG || '';
        const year = movie?.year || 'Unknown';
        const rating = movie?.imdbRating ? `⭐ ${movie.imdbRating.toFixed(1)}` : '';

        if (viewMode === 'detail') {
            card.classList.add('detail-item');
            
            card.innerHTML = `
                <img src="${posterUrl}" alt="${copy.title}" class="movie-poster" 
                     onerror="this.style.background='rgba(255,255,255,0.1)'; this.innerHTML='🎬'; this.style.display='flex'; this.style.alignItems='center'; this.style.justifyContent='center'; this.style.fontSize='2rem';">
                <div class="movie-content">
                    <div class="movie-title">${copy.title}</div>
                    <div class="movie-info">
                        ${year} • ${copy.format} • ${rating}
                    </div>
                    <div class="movie-details">
                        ${movie ? `
                            Director: ${movie.director}<br>
                            Genre: ${movie.genre}<br>
                        ` : ''}
                        ${copy.edition ? `Edition: ${copy.edition}<br>` : ''}
                        ${copy.region ? `Region: ${copy.region}` : ''}
                    </div>
                </div>
            `;
        } else if (viewMode === 'list') {
            card.classList.add('list-item');
            
            card.innerHTML = `
                <img src="${posterUrl}" alt="${copy.title}" class="movie-poster" 
                     onerror="this.style.background='rgba(255,255,255,0.1)'; this.innerHTML='🎬'; this.style.display='flex'; this.style.alignItems='center'; this.style.justifyContent='center'; this.style.fontSize='1rem';">
                <div class="movie-content">
                    <div class="movie-title">${copy.title}</div>
                    <div class="movie-info">${year} • ${copy.format}</div>
                </div>
            `;
        } else if (viewMode === 'small') {
            card.classList.add('small-item');
            
            card.innerHTML = `
                <img src="${posterUrl}" alt="${copy.title}" class="movie-poster" 
                     onerror="this.style.background='rgba(255,255,255,0.1)'; this.innerHTML='🎬'; this.style.display='flex'; this.style.alignItems='center'; this.style.justifyContent='center'; this.style.fontSize='1.2rem';">
                <div class="movie-title">${copy.title}</div>
                <div class="movie-info">
                    ${year} • ${copy.format}<br>
                    ${rating}
                </div>
            `;
        } else {
            card.innerHTML = `
                <img src="${posterUrl}" alt="${copy.title}" class="movie-poster" 
                     onerror="this.style.background='rgba(255,255,255,0.1)'; this.innerHTML='🎬'; this.style.display='flex'; this.style.alignItems='center'; this.style.justifyContent='center'; this.style.fontSize='2rem';">
                <div class="movie-title">${copy.title}</div>
                <div class="movie-info">
                    ${year} • ${copy.format}<br>
                    ${rating}
                </div>
            `;
        }

        return card;
    }

    function showMovieDetail(copy, movie) {
        const modal = document.getElementById('detailModal');
        const content = document.getElementById('movieDetail');

        const posterUrl = movie?.posterIMG || '';
        const oppositeType = copy.isWishlist ? 'collection' : 'wishlist';
        const oppositeLabel = copy.isWishlist ? 'Collection' : 'Wishlist';

        content.innerHTML = `
            <img src="${posterUrl}" alt="${copy.title}" class="movie-detail-poster" 
                 onerror="this.style.background='rgba(255,255,255,0.1)'; this.innerHTML='🎬'; this.style.display='flex'; this.style.alignItems='center'; this.style.justifyContent='center'; this.style.fontSize='3rem';">

            <div class="detail-section">
                <div class="detail-title">${copy.title}</div>
                <div class="detail-text">
                    ${movie ? `
                        <strong>Year:</strong> ${movie.year || 'Unknown'}<br>
                        <strong>Rating:</strong> ${movie.imdbRating ? `⭐ ${movie.imdbRating.toFixed(1)}/10` : 'Not rated'}<br>
                        <strong>Runtime:</strong> ${movie.runtime}<br>
                        <strong>Director:</strong> ${movie.director}<br>
                        <strong>Genre:</strong> ${movie.genre}<br><br>
                        <strong>Plot:</strong><br>${movie.plot}
                    ` : 'No movie information available'}
                </div>
            </div>

            <div class="detail-section">
                <div class="detail-title">Your Copy Details</div>
                <div class="detail-text">
                    <strong>Format:</strong> ${copy.format}<br>
                    ${copy.region ? `<strong>Region:</strong> ${copy.region}<br>` : ''}
                    <strong>Discs:</strong> ${copy.discs}<br>
                    ${copy.edition ? `<strong>Edition:</strong> ${copy.edition}<br>` : ''}
                    ${copy.languages ? `<strong>Languages:</strong> ${copy.languages}<br>` : ''}
                    ${copy.upc ? `<strong>UPC:</strong> ${copy.upc}<br>` : ''}
                    ${copy.notes ? `<strong>Notes:</strong> ${copy.notes}<br>` : ''}
                    <strong>Added:</strong> ${new Date(copy.created).toLocaleDateString()}<br>
                    <strong>Status:</strong> ${copy.resolved ? '✅ Resolved' : '❌ Unresolved'}
                </div>
            </div>

            ${!copy.resolved ? `
                <button onclick="App.resolveMovieFromDetail('${copy.id}')" class="btn" style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%);">
                    🔍 Resolve Movie
                </button>
            ` : ''}
            
            <button onclick="App.startEditMovie('${copy.id}')" class="btn" style="background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);">
                ✏️ Edit Movie
            </button>
            
            <button onclick="App.moveCopy('${copy.id}', ${!copy.isWishlist})" class="btn">
                Move to ${oppositeLabel}
            </button>
            <button onclick="App.deleteCopy('${copy.id}')" class="btn btn-danger">
                Delete
            </button>
        `;

        modal.classList.add('active');
    }

    function moveCopy(copyId, toWishlist) {
        const copyIndex = copies.findIndex(c => c.id === copyId);
        if (copyIndex !== -1) {
            copies[copyIndex].isWishlist = toWishlist;
            saveData();
            closeModal('detailModal');
            showStatus(`Moved to ${toWishlist ? 'wishlist' : 'collection'}!`, 'success');
            updateUI();
        }
    }

    function deleteCopy(copyId) {
        if (confirm('Are you sure you want to delete this item?')) {
            const copyToDelete = copies.find(c => c.id === copyId);
            const itemTitle = copyToDelete ? copyToDelete.title : 'Unknown';
            
            // Remove from copies array
            copies = copies.filter(c => c.id !== copyId);
            saveData();
            
            // Close modal and update UI
            closeModal('detailModal');
            
            // Force complete UI refresh
            setTimeout(() => {
                updateUI();
                displayMovies('collection');
                displayMovies('wishlist');
                showStatus(`"${itemTitle}" deleted successfully!`, 'success');
            }, 100);
        }
    }

    function resolveMovieFromDetail(copyId) {
        const copy = copies.find(c => c.id === copyId);
        if (!copy) return;

        // Set this as the current resolve item and switch to scan tab
        currentResolveItem = copy;
        
        // Pre-fill the form with copy data
        document.getElementById('movieTitle').value = copy.title;
        document.getElementById('format').value = copy.format;
        document.getElementById('region').value = copy.region;
        document.getElementById('discs').value = copy.discs;
        document.getElementById('edition').value = copy.edition;
        document.getElementById('languages').value = copy.languages;
        document.getElementById('upc').value = copy.upc;
        document.getElementById('notes').value = copy.notes;

        closeModal('detailModal');
        switchTab('scan');
        updateResolveNextSection();
        
        showStatus(`Ready to resolve "${copy.title}" - search by title or IMDB ID`, 'success');
    }

    function displayUnresolvedItems() {
        const unresolvedCopies = copies.filter(copy => !copy.resolved);
        const container = document.getElementById('resolveList');
        const empty = document.getElementById('resolveEmpty');

        if (unresolvedCopies.length === 0) {
            container.innerHTML = '';
            empty.style.display = 'block';
            return;
        }

        empty.style.display = 'none';
        container.innerHTML = '';

        unresolvedCopies.forEach(copy => {
            const item = document.createElement('div');
            item.className = 'resolve-item';

            item.innerHTML = `
                <div class="resolve-title">${copy.title}</div>
                <div class="resolve-details">
                    Format: ${copy.format} • 
                    ${copy.isWishlist ? 'Wishlist' : 'Collection'}<br>
                    ${copy.edition ? `Edition: ${copy.edition} • ` : ''}
                    Added: ${new Date(copy.created).toLocaleDateString()}
                </div>
                <button onclick="App.findMovieData('${copy.id}')" class="btn">
                    🔍 Find Movie Data
                </button>
            `;

            container.appendChild(item);
        });
    }

    function findMovieData(copyId) {
        const copy = copies.find(c => c.id === copyId);
        if (!copy) return;

        currentResolveItem = copy;
        
        document.getElementById('movieTitle').value = copy.title;
        document.getElementById('format').value = copy.format;
        document.getElementById('region').value = copy.region;
        document.getElementById('discs').value = copy.discs;
        document.getElementById('edition').value = copy.edition;
        document.getElementById('languages').value = copy.languages;
        document.getElementById('upc').value = copy.upc;
        document.getElementById('notes').value = copy.notes;

        updateResolveNextSection();
        switchTab('scan');
        
        showStatus(`Ready to search for "${copy.title}" - click Search Movie Database`, 'success');
    }

    function updateResolveNextSection() {
        const section = document.getElementById('resolveNextSection');
        const info = document.getElementById('resolveNextInfo');
        
        if (currentResolveItem) {
            const unresolvedCopies = copies.filter(copy => 
                !copy.resolved && 
                !skippedResolveItems.includes(copy.id)
            );
            const currentIndex = unresolvedCopies.findIndex(c => c.id === currentResolveItem.id);
            const totalUnresolved = copies.filter(copy => !copy.resolved).length;
            const skippedCount = skippedResolveItems.length;
            const remaining = unresolvedCopies.length;
            
            section.style.display = 'block';
            info.innerHTML = `
                <strong>Currently resolving:</strong> ${currentResolveItem.title}<br>
                <strong>Format:</strong> ${currentResolveItem.format} • 
                <strong>Type:</strong> ${currentResolveItem.isWishlist ? 'Wishlist' : 'Collection'}<br>
                <strong>Progress:</strong> ${currentIndex + 1} of ${remaining} remaining items<br>
                ${skippedCount > 0 ? `<strong>Skipped:</strong> ${skippedCount} items<br>` : ''}
                <strong>Total unresolved:</strong> ${totalUnresolved} items
            `;
        } else {
            section.style.display = 'none';
        }
    }

    function updateEditSection() {
        const section = document.getElementById('editSection');
        const info = document.getElementById('editInfo');
        
        if (currentEditItem) {
            section.style.display = 'block';
            info.innerHTML = `
                <strong>Currently editing:</strong> ${currentEditItem.title}<br>
                <strong>Original format:</strong> ${currentEditItem.format} • 
                <strong>Type:</strong> ${currentEditItem.isWishlist ? 'Wishlist' : 'Collection'}<br>
                Make your changes below and click "Save Changes" to save.
            `;
        } else {
            section.style.display = 'none';
        }
    }

    function startEditMovie(copyId) {
        const copy = copies.find(c => c.id === copyId);
        if (!copy) return;

        currentEditItem = copy;
        currentResolveItem = null; // Clear resolve mode if active
        
        // Pre-fill the form with existing copy data
        document.getElementById('movieTitle').value = copy.title;
        document.getElementById('format').value = copy.format || '';
        document.getElementById('region').value = copy.region || '';
        document.getElementById('discs').value = copy.discs || 1;
        document.getElementById('edition').value = copy.edition || '';
        document.getElementById('languages').value = copy.languages || '';
        document.getElementById('upc').value = copy.upc || '';
        document.getElementById('notes').value = copy.notes || '';

        // Clear IMDB ID field when editing
        document.getElementById('imdbId').value = '';

        // Update UI
        updateEditSection();
        updateResolveNextSection();
        
        // Switch to scan tab and close detail modal
        closeModal('detailModal');
        switchTab('scan');
        
        showStatus(`Ready to edit "${copy.title}" - make your changes and click "Save Changes"`, 'success');
    }

    function cancelEdit() {
        currentEditItem = null;
        
        // Clear the form
        document.getElementById('movieForm').reset();
        document.getElementById('imdbId').value = '';
        updateEditionDropdown();
        
        // Update UI
        updateEditSection();
        
        showStatus('Edit cancelled', 'success');
    }

    function saveEditChanges() {
        if (!currentEditItem) {
            showStatus('No movie currently being edited', 'error');
            return;
        }
        
        // Trigger form submission to save changes
        // We'll submit to the same collection/wishlist the movie is currently in
        const form = document.getElementById('movieForm');
        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
        
        // Set the submitter to maintain the current list type
        Object.defineProperty(submitEvent, 'submitter', {
            value: { name: currentEditItem.isWishlist ? 'wishlist' : 'collection' },
            enumerable: true
        });
        
        form.dispatchEvent(submitEvent);
    }

    function skipToNextUnresolved() {
        if (!currentResolveItem) {
            showStatus('No item currently being resolved', 'error');
            return;
        }

        // Add current item to skipped list
        if (!skippedResolveItems.includes(currentResolveItem.id)) {
            skippedResolveItems.push(currentResolveItem.id);
        }

        const unresolvedCopies = copies.filter(copy => 
            !copy.resolved && 
            !skippedResolveItems.includes(copy.id)
        );
        
        if (unresolvedCopies.length === 0) {
            currentResolveItem = null;
            updateResolveNextSection();
            showStatus('No more unresolved items to process! All remaining items have been skipped.', 'success');
            return;
        }

        // Get the next unresolved item (not skipped)
        const nextItem = unresolvedCopies[0];
        findMovieData(nextItem.id);
        
        showStatus(`Skipped "${currentResolveItem.title}" - moved to next item`, 'success');
    }

    function deleteCurrentResolveItem() {
        if (!currentResolveItem) {
            showStatus('No item currently being resolved', 'error');
            return;
        }

        const itemTitle = currentResolveItem.title;
        
        if (confirm(`Are you sure you want to delete "${itemTitle}"? This cannot be undone.`)) {
            // Remove from copies array
            copies = copies.filter(c => c.id !== currentResolveItem.id);
            
            // Remove from skipped list if it was there
            skippedResolveItems = skippedResolveItems.filter(id => id !== currentResolveItem.id);
            
            saveData();
            
            // Clear the form
            document.getElementById('movieForm').reset();
            document.getElementById('imdbId').value = '';
            updateEditionDropdown();
            
            // Find next unresolved item
            const unresolvedCopies = copies.filter(copy => 
                !copy.resolved && 
                !skippedResolveItems.includes(copy.id)
            );
            
            if (unresolvedCopies.length > 0) {
                findMovieData(unresolvedCopies[0].id);
                showStatus(`Deleted "${itemTitle}" - moved to next unresolved item`, 'success');
            } else {
                currentResolveItem = null;
                updateResolveNextSection();
                showStatus(`Deleted "${itemTitle}" - no more unresolved items to process!`, 'success');
            }
            
            // Update UI to reflect changes
            updateUI();
        }
    }

    function updateUI() {
        const activeTab = document.querySelector('.tab.active');
        if (activeTab) {
            const tabName = activeTab.textContent.toLowerCase().trim();
            if (tabName === 'collection') {
                document.getElementById('collectionSort').value = currentSort.collection;
                updateViewButtons('collection');
                displayMovies('collection');
            } else if (tabName === 'wishlist') {
                document.getElementById('wishlistSort').value = currentSort.wishlist;
                updateViewButtons('wishlist');
                displayMovies('wishlist');
            } else if (tabName === 'resolve') {
                displayUnresolvedItems();
            } else if (tabName === 'data') {
                updateStats();
                updateUserDropdown();
            } else if (tabName === 'settings') {
                updateSettingsUI();
            } else if (tabName === 'scan') {
                updateResolveNextSection();
            }
        }
    }

    function exportData() {
        const csvRows = [];
        csvRows.push([
            'Title', 'Format', 'Region', 'Discs', 'Edition', 'Languages', 'UPC', 'Notes',
            'Type', 'Year', 'Rating', 'Director', 'Genre', 'Plot', 'IMDB_ID', 'Added'
        ]);

        copies.forEach(copy => {
            const movie = movies.find(m => m.imdbID === copy.movieId);
            csvRows.push([
                copy.title,
                copy.format,
                copy.region || '',
                copy.discs,
                copy.edition || '',
                copy.languages || '',
                copy.upc || '',
                copy.notes || '',
                copy.isWishlist ? 'Wishlist' : 'Collection',
                movie?.year || '',
                movie?.imdbRating || '',
                movie?.director || '',
                movie?.genre || '',
                movie?.plot || '',
                movie?.imdbID || '',
                new Date(copy.created).toLocaleDateString()
            ]);
        });

        const csvContent = csvRows.map(row => 
            row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')
        ).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cineshelf-${currentUser}-export-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        showStatus('Collection exported successfully!', 'success');
    }

    function importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                let importedData;
                
                if (file.name.endsWith('.json')) {
                    importedData = JSON.parse(e.target.result);
                    
                    if (importedData.copies && importedData.movies) {
                        copies = importedData.copies;
                        movies = importedData.movies;
                    } else {
                        throw new Error('Invalid JSON format');
                    }
                } else if (file.name.endsWith('.csv')) {
                    const lines = e.target.result.split('\n');
                    const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));
                    
                    copies = [];
                    movies = [];
                    
                    for (let i = 1; i < lines.length; i++) {
                        if (!lines[i].trim()) continue;
                        
                        const values = lines[i].split('","').map(v => v.replace(/"/g, ''));
                        
                        const copy = {
                            id: Date.now().toString() + i,
                            title: values[0] || '',
                            format: values[1] || 'Unknown',
                            region: values[2] || '',
                            discs: parseInt(values[3]) || 1,
                            edition: values[4] || '',
                            languages: values[5] || '',
                            upc: values[6] || '',
                            notes: values[7] || '',
                            isWishlist: values[8] === 'Wishlist',
                            movieId: null,
                            resolved: false,
                            created: new Date().toISOString()
                        };
                        
                        copies.push(copy);
                    }
                }

                saveData();
                updateUI();
                showStatus(`Imported ${copies.length} items successfully!`, 'success');
                
            } catch (error) {
                console.error('Import error:', error);
                showStatus('Import failed. Please check the file format.', 'error');
            }
        };

        reader.readAsText(file);
        event.target.value = '';
    }

    function clearAllData() {
        if (confirm('Are you sure you want to clear ALL data for this user? This cannot be undone!')) {
            if (confirm('This will delete your entire collection and wishlist. Are you absolutely sure?')) {
                copies = [];
                movies = [];
                currentResolveItem = null;
                skippedResolveItems = []; // Reset skipped items when clearing data
                saveData();
                updateUI();
                showStatus('All data cleared!', 'success');
            }
        }
    }

    function updateStats() {
        const collectionCount = copies.filter(c => !c.isWishlist).length;
        const wishlistCount = copies.filter(c => c.isWishlist).length;
        const unresolvedCount = copies.filter(c => !c.resolved).length;
        
        const formatStats = {};
        copies.forEach(copy => {
            formatStats[copy.format] = (formatStats[copy.format] || 0) + 1;
        });

        const statsHtml = `
            <strong>Current User:</strong> ${currentUser === 'default' ? 'Default User' : currentUser}<br>
            <strong>Collection:</strong> ${collectionCount} items<br>
            <strong>Wishlist:</strong> ${wishlistCount} items<br>
            <strong>Unresolved:</strong> ${unresolvedCount} items<br>
            <strong>Total Movies:</strong> ${movies.length} with data<br><br>
            <strong>Format Breakdown:</strong><br>
            ${Object.entries(formatStats).map(([format, count]) => 
                `${format}: ${count}`
            ).join('<br>')}
        `;

        document.getElementById('stats').innerHTML = statsHtml;
    }

    function closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    }

    function saveData() {
        try {
            localStorage.setItem(`cineshelf_copies_${currentUser}`, JSON.stringify(copies));
            localStorage.setItem(`cineshelf_movies_${currentUser}`, JSON.stringify(movies));
            localStorage.setItem('cineshelf_users', JSON.stringify(users));
            localStorage.setItem('cineshelf_current_user', currentUser);
        } catch (error) {
            console.error('Error saving data:', error);
            showStatus('Warning: Could not save data to device storage', 'error');
        }
    }

    function loadData() {
        try {
            const savedUsers = localStorage.getItem('cineshelf_users');
            const savedCurrentUser = localStorage.getItem('cineshelf_current_user');
            
            if (savedUsers) {
                users = JSON.parse(savedUsers);
            }
            
            if (savedCurrentUser && users.includes(savedCurrentUser)) {
                currentUser = savedCurrentUser;
            }
            
            const savedCopies = localStorage.getItem(`cineshelf_copies_${currentUser}`);
            const savedMovies = localStorage.getItem(`cineshelf_movies_${currentUser}`);
            const savedSort = localStorage.getItem('cineshelf_sort');
            const savedView = localStorage.getItem('cineshelf_view');
            
            if (savedCopies) {
                copies = JSON.parse(savedCopies);
            }
            
            if (savedMovies) {
                movies = JSON.parse(savedMovies);
            }
            
            if (savedSort) {
                currentSort = { ...currentSort, ...JSON.parse(savedSort) };
            }
            
            if (savedView) {
                currentView = { ...currentView, ...JSON.parse(savedView) };
            }
            
            // Load settings
            loadSettings();
            
            updateUserDropdown();
        } catch (error) {
            console.error('Error loading data:', error);
            copies = [];
            movies = [];
        }
    }

    function updateUserDropdown() {
        const dropdown = document.getElementById('currentUser');
        if (!dropdown) return;
        
        dropdown.innerHTML = '';
        
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user;
            option.textContent = user === 'default' ? 'Default User' : user;
            if (user === currentUser) {
                option.selected = true;
            }
            dropdown.appendChild(option);
        });
    }

    function switchUser(newUser) {
        if (newUser === currentUser) return;
        
        saveData();
        currentUser = newUser;
        
        const savedCopies = localStorage.getItem(`cineshelf_copies_${currentUser}`);
        const savedMovies = localStorage.getItem(`cineshelf_movies_${currentUser}`);
        
        copies = savedCopies ? JSON.parse(savedCopies) : [];
        movies = savedMovies ? JSON.parse(savedMovies) : [];
        
        currentResolveItem = null;
        skippedResolveItems = []; // Reset skipped items when switching users
        localStorage.setItem('cineshelf_current_user', currentUser);
        
        updateUI();
        showStatus(`Switched to user: ${newUser === 'default' ? 'Default User' : newUser}`, 'success');
    }

    function addUser() {
        const input = document.getElementById('newUserName');
        const userName = input.value.trim();
        
        if (!userName) {
            showStatus('Please enter a user name', 'error');
            return;
        }
        
        if (users.includes(userName)) {
            showStatus('User already exists', 'error');
            return;
        }
        
        users.push(userName);
        updateUserDropdown();
        saveData();
        
        input.value = '';
        showStatus(`User "${userName}" added successfully`, 'success');
    }

    function deleteCurrentUser() {
        if (currentUser === 'default') {
            showStatus('Cannot delete the default user', 'error');
            return;
        }
        
        if (users.length <= 1) {
            showStatus('Cannot delete the last user', 'error');
            return;
        }
        
        if (confirm(`Are you sure you want to delete user "${currentUser}" and all their data?`)) {
            localStorage.removeItem(`cineshelf_copies_${currentUser}`);
            localStorage.removeItem(`cineshelf_movies_${currentUser}`);
            
            users = users.filter(user => user !== currentUser);
            switchUser('default');
            
            showStatus('User deleted successfully', 'success');
        }
    }

    // Server backup/restore functions
    async function backupToServer() {
        const serverStatus = document.getElementById('serverStatus');
        
        try {
            const data = {
                user: currentUser,
                copies: copies,
                movies: movies,
                customEditions: customEditions,
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent,
                deviceInfo: {
                    platform: navigator.platform,
                    language: navigator.language,
                    cookieEnabled: navigator.cookieEnabled
                }
            };
            
            const endpoints = ['backup.php', 'api/backup', 'data/backup.php'];
            let success = false;
            
            for (const endpoint of endpoints) {
                try {
                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-User-ID': currentUser,
                            'X-Backup-Version': '2.0'
                        },
                        body: JSON.stringify(data)
                    });
                    
                    if (response.ok) {
                        const result = await response.json();
                        success = true;
                        
                        localStorage.setItem(`cineshelf_last_backup_${currentUser}`, JSON.stringify({
                            timestamp: data.timestamp,
                            itemCount: copies.length,
                            movieCount: movies.length,
                            customEditionsCount: customEditions.length,
                            endpoint: endpoint
                        }));
                        
                        serverStatus.textContent = `Backup successful! ${copies.length} items backed up to server.`;
                        serverStatus.className = 'status success';
                        serverStatus.style.display = 'block';
                        setTimeout(() => serverStatus.style.display = 'none', 4000);
                        break;
                    }
                } catch (endpointError) {
                    console.log(`Endpoint ${endpoint} failed:`, endpointError);
                }
            }
            
            if (!success) {
                throw new Error('All backup endpoints failed');
            }
            
        } catch (error) {
            console.error('Backup error:', error);
            serverStatus.innerHTML = `
                <strong>Backup failed</strong><br>
                Please create these server files:<br>
                <code>backup.php</code> - to save data<br>
                <code>restore.php</code> - to load data<br>
                <small>Data count: ${copies.length} items, ${movies.length} movies</small>
            `;
            serverStatus.className = 'status error';
            serverStatus.style.display = 'block';
            setTimeout(() => serverStatus.style.display = 'none', 8000);
        }
    }

    async function restoreFromServer(forceFile = null) {
        const serverStatus = document.getElementById('serverStatus');
        
        try {
            console.log('CineShelf: Starting restore for user:', currentUser);
            console.log('CineShelf: Force file:', forceFile);
            
            const endpoints = [`restore.php?user=${encodeURIComponent(currentUser)}${forceFile ? `&file=${encodeURIComponent(forceFile)}` : ''}`, 
                             `api/restore/${encodeURIComponent(currentUser)}`, 
                             `data/restore.php?user=${encodeURIComponent(currentUser)}`];
            
            let data = null;
            let successEndpoint = null;
            let allErrors = [];
            
            for (const endpoint of endpoints) {
                try {
                    console.log('CineShelf: Trying endpoint:', endpoint);
                    
                    const response = await fetch(endpoint, {
                        method: 'GET',
                        headers: {
                            'X-User-ID': currentUser,
                            'X-Restore-Version': '2.1',
                            'X-Device-Type': /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
                        }
                    });
                    
                    console.log('CineShelf: Response status:', response.status);
                    
                    if (response.ok) {
                        const responseData = await response.json();
                        console.log('CineShelf: Response data keys:', Object.keys(responseData));
                        
                        if (responseData && 
                            responseData.copies && 
                            Array.isArray(responseData.copies) &&
                            responseData.movies && 
                            Array.isArray(responseData.movies)) {
                            data = responseData;
                            successEndpoint = endpoint;
                            break;
                        } else if (responseData.available_backups) {
                            // Show available backups for manual selection
                            showAvailableBackups(responseData.available_backups);
                            return;
                        } else {
                            allErrors.push(`${endpoint}: Invalid data structure`);
                        }
                    } else {
                        const errorData = await response.json();
                        
                        // If server returns available backups, show them
                        if (errorData.available_backups) {
                            showAvailableBackups(errorData.available_backups);
                            return;
                        }
                        
                        allErrors.push(`${endpoint}: ${response.status} - ${errorData.error || 'Unknown error'}`);
                        console.log('CineShelf: Error response:', errorData);
                    }
                } catch (endpointError) {
                    allErrors.push(`${endpoint}: ${endpointError.message}`);
                    console.log(`Restore endpoint ${endpoint} failed:`, endpointError);
                }
            }
            
            if (!data) {
                console.log('CineShelf: All restore attempts failed:', allErrors);
                throw new Error(`No valid backup found. Errors: ${allErrors.join('; ')}`);
            }
            
            const backupLabel = data.backupLabel || 'Unknown backup';
            const backupTime = data.timestamp ? new Date(data.timestamp).toLocaleString() : 'Unknown time';
            const serverCopies = data.copies ? data.copies.length : 0;
            const serverMovies = data.movies ? data.movies.length : 0;
            const serverCustomEditions = data.customEditions ? data.customEditions.length : 0;
            const serverResolved = data.copies ? data.copies.filter(c => c.resolved).length : 0;
            
            const currentCopies = copies.length;
            const currentMovies = movies.length;
            const currentCustomEditions = customEditions.length;
            const currentResolved = copies.filter(c => c.resolved).length;
            
            // Add restore metadata info if available
            const metadataInfo = data._restore_metadata ? 
                `\n📁 File used: ${data._restore_metadata.filename_used}` : '';
            
            const confirmMessage = `🔍 Found Server Backup: "${backupLabel}"
📅 Backup Date: ${backupTime}
📊 Server Data: ${serverCopies} items, ${serverMovies} movies, ${serverResolved} resolved, ${serverCustomEditions} custom editions
📱 Your Device: ${currentCopies} items, ${currentMovies} movies, ${currentResolved} resolved, ${currentCustomEditions} custom editions${metadataInfo}

⚠️ This will REPLACE all data on this device with server data.
Continue with restore?`;
            
            if (confirm(confirmMessage)) {
                const safetyBackup = {
                    copies: JSON.parse(JSON.stringify(copies)),
                    movies: JSON.parse(JSON.stringify(movies)),
                    customEditions: JSON.parse(JSON.stringify(customEditions)),
                    timestamp: new Date().toISOString(),
                    backupReason: 'safety_before_restore'
                };
                localStorage.setItem(`cineshelf_safety_backup_${currentUser}`, JSON.stringify(safetyBackup));
                
                copies = [];
                movies = [];
                customEditions = [];
                
                localStorage.removeItem(`cineshelf_copies_${currentUser}`);
                localStorage.removeItem(`cineshelf_movies_${currentUser}`);
                localStorage.removeItem(STORAGE_KEYS.customEditions);
                
                copies = JSON.parse(JSON.stringify(data.copies)) || [];
                movies = JSON.parse(JSON.stringify(data.movies)) || [];
                customEditions = JSON.parse(JSON.stringify(data.customEditions)) || [];

                let fixedItems = 0;
                copies.forEach((copy, index) => {
                    if (!copy.id) {
                        copy.id = Date.now().toString() + '_' + index;
                        fixedItems++;
                    }
                    if (!copy.created) {
                        copy.created = new Date().toISOString();
                        fixedItems++;
                    }
                    if (copy.resolved === undefined) {
                        copy.resolved = !!copy.movieId;
                        fixedItems++;
                    }
                    
                    if (copy.movieId && !movies.find(m => m.imdbID === copy.movieId)) {
                        console.warn(`Copy "${copy.title}" links to missing movie ${copy.movieId}`);
                        copy.resolved = false;
                        copy.movieId = null;
                        fixedItems++;
                    }
                });
                
                movies.forEach((movie, index) => {
                    if (!movie.imdbID) {
                        movie.imdbID = 'unknown_' + index;
                        fixedItems++;
                    }
                    if (!movie.title) {
                        movie.title = 'Unknown Title';
                        fixedItems++;
                    }
                });
                
                saveData();
                saveCustomEditions();
                updateUI();
                updateEditionDropdown();
                
                const finalResolvedCount = copies.filter(c => c.resolved).length;
                const finalUnresolvedCount = copies.filter(c => !c.resolved).length;
                const fileUsed = data._restore_metadata ? data._restore_metadata.filename_used : 'Unknown';
                
                serverStatus.innerHTML = `
                    <strong>✅ Restore SUCCESS!</strong><br>
                    🔍 Backup: ${backupLabel}<br>
                    📊 Loaded: ${copies.length} items, ${movies.length} movies, ${customEditions.length} custom editions<br>
                    ✅ Resolved: ${finalResolvedCount} | ❌ Unresolved: ${finalUnresolvedCount}<br>
                    🔧 Fixed: ${fixedItems} data issues<br>
                    📁 File: ${fileUsed}<br>
                    📡 Source: ${successEndpoint}
                `;
                serverStatus.className = 'status success show';
                serverStatus.style.display = 'block';
                setTimeout(() => {
                    serverStatus.classList.remove('show');
                    serverStatus.style.display = 'none';
                }, 10000);
            }
            
        } catch (error) {
            console.error('Restore error:', error);
            serverStatus.innerHTML = `
                <strong>❌ Restore Failed</strong><br>
                No backup found for user "${currentUser}"<br>
                <small>Ensure you've backed up data from another device first</small><br>
                Error: ${error.message}
            `;
            serverStatus.className = 'status error show';
            serverStatus.style.display = 'block';
            setTimeout(() => {
                serverStatus.classList.remove('show');
                serverStatus.style.display = 'none';
            }, 8000);
        }
    }

    function showAvailableBackups(backups) {
        const serverStatus = document.getElementById('serverStatus');
        
        if (!backups || backups.length === 0) {
            serverStatus.innerHTML = `
                <strong>❌ No Backups Found</strong><br>
                No backup files found for user "${currentUser}"<br>
                <small>Create a backup from another device first</small>
            `;
            serverStatus.className = 'status error show';
            serverStatus.style.display = 'block';
            return;
        }
        
        let backupList = '<strong>📁 Available Backup Files:</strong><br>';
        backupList += '<div style="margin: 1rem 0; max-height: 200px; overflow-y: auto;">';
        
        backups.forEach((backup, index) => {
            const date = new Date(backup.modified).toLocaleDateString();
            const size = Math.round(backup.size / 1024);
            backupList += `
                <div style="background: rgba(255,255,255,0.1); padding: 0.5rem; margin: 0.25rem 0; border-radius: 6px; cursor: pointer;" 
                     onclick="window.App.restoreSpecificFile('${backup.filename}')">
                    <strong>${backup.filename}</strong><br>
                    <small>User: ${backup.user_part} • ${date} • ${size}KB</small>
                </div>
            `;
        });
        
        backupList += '</div>';
        backupList += '<small>Click on a backup file to restore it</small>';
        
        serverStatus.innerHTML = backupList;
        serverStatus.className = 'status show';
        serverStatus.style.display = 'block';
    }

    function restoreSpecificFile(filename) {
        if (confirm(`Restore from backup file: ${filename}?`)) {
            restoreFromServer(filename);
        }
    }

    function setViewMode(type, mode) {
        currentView[type] = mode;
        
        const container = document.getElementById(type).querySelector('.view-toggle');
        container.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
        
        const buttons = container.querySelectorAll('.view-btn');
        buttons.forEach(btn => {
            const onclick = btn.getAttribute('onclick');
            if (onclick && onclick.includes(`'${mode}'`)) {
                btn.classList.add('active');
            }
        });
        
        displayMovies(type);
        
        try {
            localStorage.setItem('cineshelf_view', JSON.stringify(currentView));
        } catch (error) {
            console.error('Error saving view preference:', error);
        }
    }

    function setTitleFromCoverScanner(title) {
        document.getElementById('movieTitle').value = title;
        switchTab('scan');
        showStatus(`Title set from cover scan: ${title}`, 'success');
    }

    async function loadUnresolvedMoviesFromServer() {
        console.log('Auto-resolve placeholder - would check server for movie data');
    }

    // Settings Management Functions
    function updateSetting(key, value) {
        // Convert string values to appropriate types
        if (value === 'true') value = true;
        if (value === 'false') value = false;
        if (!isNaN(value) && value !== '') value = parseInt(value);
        
        // Don't save null or undefined values
        if (value === null || value === undefined) {
            if (settings.debugMode) {
                console.log(`CineShelf Debug: Attempted to save null/undefined value for ${key}, ignoring`);
            }
            return;
        }
        
        settings[key] = value;
        saveSettings();
        
        if (settings.debugMode) {
            console.log(`CineShelf Debug: Updated setting ${key} to ${value}`);
        }
        
        // Apply settings that need immediate effect
        applySettings();
        
        showStatus(`Setting updated: ${key}`, 'success');
    }

    function resetSettings() {
        if (confirm('Reset all settings to defaults? This cannot be undone.')) {
            settings = {
                searchResultsLimit: 10,
                defaultViewMode: 'grid',
                autoResolve: false,
                barcodeBeep: true,
                scannerVibration: true,
                debugMode: false,
                autoBackup: false,
                compactMode: false,
                appTheme: 'cosmic',
                animationSpeed: 'normal',
                cardStyle: 'rounded',
                openaiApiKey: '',
                tmdbApiKey: ''
            };
            saveSettings();
            updateSettingsUI();
            applySettings();
            showStatus('All settings reset to defaults!', 'success');
        }
    }

    function updateSettingsUI() {
        if (settings.debugMode) {
            console.log('CineShelf Debug: Updating Settings UI with:', settings);
        }
        
        // Update all setting controls to match current settings
        Object.keys(settings).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                const settingValue = settings[key];
                
                // Handle null/undefined values safely
                if (settingValue === null || settingValue === undefined) {
                    if (settings.debugMode) {
                        console.log(`CineShelf Debug: Setting ${key} is null/undefined, skipping`);
                    }
                    return;
                }
                
                if (element.type === 'password' || element.type === 'text') {
                    element.value = settingValue || '';
                } else {
                    element.value = settingValue.toString();
                }
                
                if (settings.debugMode) {
                    console.log(`CineShelf Debug: Updated ${key} to ${element.value}`);
                }
            } else if (settings.debugMode) {
                console.log(`CineShelf Debug: Element not found for setting: ${key}`);
            }
        });
        
        // Update last update timestamp
        const lastUpdateElement = document.getElementById('lastUpdate');
        if (lastUpdateElement) {
            lastUpdateElement.textContent = new Date().toLocaleDateString();
        }
        
        // Force a visual refresh of the dropdowns
        setTimeout(() => {
            Object.keys(settings).forEach(key => {
                const element = document.getElementById(key);
                const settingValue = settings[key];
                
                if (element && element.tagName === 'SELECT' && settingValue !== null && settingValue !== undefined) {
                    // Force dropdown to refresh its selected state
                    const targetValue = settingValue.toString();
                    const optionIndex = Array.from(element.options).findIndex(option => option.value === targetValue);
                    
                    if (optionIndex !== -1) {
                        element.selectedIndex = optionIndex;
                        if (settings.debugMode) {
                            console.log(`CineShelf Debug: Set dropdown ${key} to index ${optionIndex} (${targetValue})`);
                        }
                    } else if (settings.debugMode) {
                        console.log(`CineShelf Debug: No option found for ${key} value: ${targetValue}`);
                    }
                }
            });
        }, 10);
    }

    function applySettings() {
        // Apply compact mode
        if (settings.compactMode) {
            document.body.classList.add('compact-mode');
        } else {
            document.body.classList.remove('compact-mode');
        }
        
        // Apply theme
        // Remove all existing theme classes
        const themeClasses = ['theme-cosmic', 'theme-dark', 'theme-light', 'theme-ocean', 'theme-forest', 'theme-sunset', 'theme-royal', 'theme-minimal'];
        themeClasses.forEach(className => document.body.classList.remove(className));
        
        // Add the selected theme class
        if (settings.appTheme && settings.appTheme !== 'cosmic') {
            document.body.classList.add(`theme-${settings.appTheme}`);
        }
        
        // Apply animation speed
        const animationClasses = ['anim-fast', 'anim-slow', 'anim-none'];
        animationClasses.forEach(className => document.body.classList.remove(className));
        
        if (settings.animationSpeed !== 'normal') {
            document.body.classList.add(`anim-${settings.animationSpeed}`);
        }
        
        // Apply card style
        const cardClasses = ['card-sharp', 'card-ultra-round', 'card-minimal'];
        cardClasses.forEach(className => document.body.classList.remove(className));
        
        if (settings.cardStyle !== 'rounded') {
            document.body.classList.add(`card-${settings.cardStyle}`);
        }
        
        // Apply default view mode to new tabs
        if (settings.defaultViewMode !== 'grid') {
            currentView.collection = settings.defaultViewMode;
            currentView.wishlist = settings.defaultViewMode;
        }
        
        // Debug mode console message
        if (settings.debugMode) {
            console.log('CineShelf Debug: Settings applied', settings);
        }
    }

    function saveSettings() {
        try {
            localStorage.setItem('cineshelf_settings', JSON.stringify(settings));
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    function loadSettings() {
        try {
            const savedSettings = localStorage.getItem('cineshelf_settings');
            if (savedSettings) {
                const parsedSettings = JSON.parse(savedSettings);
                
                // Merge saved settings with defaults, ensuring no null/undefined values
                Object.keys(settings).forEach(key => {
                    if (parsedSettings.hasOwnProperty(key) && parsedSettings[key] !== null && parsedSettings[key] !== undefined) {
                        settings[key] = parsedSettings[key];
                    }
                    // If savedSettings has null/undefined, keep the default value
                });
                
                if (settings.debugMode) {
                    console.log('CineShelf Debug: Loaded settings from localStorage:', settings);
                }
            }
            applySettings();
        } catch (error) {
            console.error('Error loading settings:', error);
            // Reset to defaults if loading fails
            settings = {
                searchResultsLimit: 10,
                defaultViewMode: 'grid',
                autoResolve: false,
                barcodeBeep: true,
                scannerVibration: true,
                debugMode: false,
                autoBackup: false,
                compactMode: false,
                appTheme: 'cosmic',
                animationSpeed: 'normal',
                cardStyle: 'rounded',
                openaiApiKey: '',
                tmdbApiKey: ''
            };
            applySettings();
        }
    }

    // Return public API
    return {
        switchTab,
        sortMovies,
        setViewMode,
        skipToNextUnresolved,
        moveCopy,
        deleteCopy,
        findMovieData,
        exportData,
        importData,
        clearAllData,
        useWithoutData,
        closeModal,
        showStatus,
        setTitleFromCoverScanner,
        switchUser,
        addUser,
        deleteCurrentUser,
        backupToServer,
        restoreFromServer,
        restoreSpecificFile,
        updateSetting,
        resetSettings,
        resolveMovieFromDetail,
        deleteCurrentResolveItem,
        addCustomEdition,
        addCustomEditionFromSettings,
        removeCustomEdition,
        resetCustomEditions,
        startEditMovie,
        cancelEdit,
        saveEditChanges,
        getSettings: () => settings,
        init
    };

})();

// Version Display and Admin System
const VersionManager = {
    async getCurrentAppVersion() {
        try {
            // Try to fetch the service worker file and extract version
            const response = await fetch('cineshelf-sw.js');
            const swContent = await response.text();
            
            // Extract version from CACHE_VERSION line
            const versionMatch = swContent.match(/CACHE_VERSION\s*=\s*['"`]([^'"`]+)['"`]/);
            if (versionMatch) {
                return versionMatch[1];
            }
            
            // Fallback to cache-based version detection
            const cacheVersion = await CineShelfUpdater.getCurrentVersion();
            return cacheVersion !== 'unknown' ? cacheVersion : 'v2.1.0';
        } catch (error) {
            console.error('Error getting app version:', error);
            return 'v2.1.0';
        }
    },

    async updateVersionDisplay() {
        const versionElement = document.getElementById('appVersion');
        const lastUpdateElement = document.getElementById('lastUpdate');
        
        if (versionElement) {
            const version = await this.getCurrentAppVersion();
            versionElement.textContent = version;
        }
        
        if (lastUpdateElement) {
            const now = new Date();
            lastUpdateElement.textContent = now.toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
        }
    }
};

// Admin Role Management System
const AdminManager = {
    adminUsers: ['admin', 'klindakoil'], // Default admin users
    
    init() {
        // Load admin users from localStorage
        const savedAdmins = localStorage.getItem('cineshelf-admin-users');
        if (savedAdmins) {
            this.adminUsers = JSON.parse(savedAdmins);
        }
        
        // Ensure there's always at least one admin
        if (this.adminUsers.length === 0) {
            this.adminUsers = ['admin'];
            this.saveAdminUsers();
        }
    },
    
    saveAdminUsers() {
        localStorage.setItem('cineshelf-admin-users', JSON.stringify(this.adminUsers));
    },
    
    isAdmin(username) {
        return this.adminUsers.includes(username);
    },
    
    getCurrentUser() {
        // Get from your existing user system
        const currentUserSelect = document.getElementById('currentUser');
        return currentUserSelect ? currentUserSelect.value : 'default';
    },
    
    isCurrentUserAdmin() {
        return this.isAdmin(this.getCurrentUser());
    },
    
    addAdmin(username) {
        if (!this.adminUsers.includes(username)) {
            this.adminUsers.push(username);
            this.saveAdminUsers();
            this.updateUIPermissions();
            return true;
        }
        return false;
    },
    
    removeAdmin(username) {
        // Prevent removing the last admin
        if (this.adminUsers.length <= 1) {
            return false;
        }
        
        const index = this.adminUsers.indexOf(username);
        if (index > -1) {
            this.adminUsers.splice(index, 1);
            this.saveAdminUsers();
            this.updateUIPermissions();
            return true;
        }
        return false;
    },
    
    updateUIPermissions() {
        const isAdmin = this.isCurrentUserAdmin();
        
        // Hide/show tabs based on admin status
        this.toggleAdminTabs(isAdmin);
        
        // Hide/show admin-only sections
        this.toggleAdminSections(isAdmin);
        
        // Update admin controls
        this.updateAdminControls(isAdmin);
    },
    
    toggleAdminTabs(isAdmin) {
        const adminTabs = ['resolve', 'data', 'settings'];
        const adminTabButtons = document.querySelectorAll('.tab');
        
        adminTabButtons.forEach(tab => {
            const tabName = tab.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
            if (adminTabs.includes(tabName)) {
                tab.style.display = isAdmin ? 'block' : 'none';
            }
        });
        
        // If current tab is admin-only and user is not admin, switch to scan tab
        if (!isAdmin) {
            const activeTab = document.querySelector('.tab.active');
            if (activeTab) {
                const activeTabName = activeTab.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
                if (adminTabs.includes(activeTabName)) {
                    // Switch to scan tab
                    if (window.App && window.App.switchTab) {
                        window.App.switchTab('scan');
                    }
                }
            }
        }
    },
    
    toggleAdminSections(isAdmin) {
        // Hide admin-only sections in existing tabs
        const adminSections = document.querySelectorAll('.admin-only');
        adminSections.forEach(section => {
            section.style.display = isAdmin ? 'block' : 'none';
        });
        
        // Hide complex features for regular users
        const complexFeatures = document.querySelectorAll('.admin-feature');
        complexFeatures.forEach(feature => {
            feature.style.display = isAdmin ? 'block' : 'none';
        });
    },
    
    updateAdminControls(isAdmin) {
        const adminControlsContainer = document.getElementById('adminControls');
        if (!adminControlsContainer) return;
        
        if (isAdmin) {
            this.renderAdminControls(adminControlsContainer);
        } else {
            adminControlsContainer.innerHTML = '<div class="detail-text">Admin access required</div>';
        }
    },
    
    renderAdminControls(container) {
        const currentUser = this.getCurrentUser();
        const allUsers = this.getAllUsers();
        
        container.innerHTML = `
            <div class="detail-title">👑 Admin Management</div>
            
            <div class="form-group">
                <label>Current Admin Users:</label>
                <div style="background: rgba(255,255,255,0.1); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                    ${this.adminUsers.map(user => `
                        <div style="display: flex; align-items: center; justify-content: space-between; margin: 0.5rem 0;">
                            <span>${user} ${user === currentUser ? '(You)' : ''}</span>
                            ${this.adminUsers.length > 1 ? `
                                <button onclick="AdminManager.removeAdmin('${user}')" 
                                        class="btn btn-danger" 
                                        style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">Remove</button>
                            ` : '<span style="opacity: 0.7; font-size: 0.8rem;">Primary Admin</span>'}
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="form-group">
                <label for="newAdminUser">Promote User to Admin:</label>
                <select id="newAdminUser">
                    <option value="">Select user to promote...</option>
                    ${allUsers.filter(user => !this.adminUsers.includes(user)).map(user => 
                        `<option value="${user}">${user}</option>`
                    ).join('')}
                </select>
                <button onclick="AdminManager.promoteUser()" class="btn btn-secondary">Promote to Admin</button>
            </div>
            
            <div class="detail-text" style="font-size: 0.8rem; opacity: 0.8; margin-top: 1rem;">
                <strong>Admin Privileges:</strong><br>
                • Access to all tabs and settings<br>
                • Server backup and restore<br>
                • User management<br>
                • Debug and update controls<br>
                • Force app updates<br><br>
                <strong>Regular Users See:</strong><br>
                • Scan, Collection, Wishlist tabs only<br>
                • Simplified movie adding workflow<br>
                • Basic export/import functions
            </div>
        `;
    },
    
    getAllUsers() {
        // Get all users from your existing user system
        const userSelect = document.getElementById('currentUser');
        if (!userSelect) return ['default'];
        
        const users = [];
        for (let option of userSelect.options) {
            users.push(option.value);
        }
        return users;
    },
    
    promoteUser() {
        const select = document.getElementById('newAdminUser');
        const username = select.value;
        
        if (username && this.addAdmin(username)) {
            if (window.App && window.App.showStatus) {
                window.App.showStatus(`✅ ${username} promoted to admin`, 'success');
            }
            select.value = '';
        }
    }
};

// Initialize admin system
document.addEventListener('DOMContentLoaded', () => {
    AdminManager.init();
    
    // Update version display
    setTimeout(() => {
        VersionManager.updateVersionDisplay();
    }, 1000);
    
    // Update UI permissions when user changes
    const userSelect = document.getElementById('currentUser');
    if (userSelect) {
        userSelect.addEventListener('change', () => {
            setTimeout(() => AdminManager.updateUIPermissions(), 100);
        });
    }
    
    // Initial permission update
    setTimeout(() => AdminManager.updateUIPermissions(), 500);
});

// Make functions globally available
window.AdminManager = AdminManager;
window.VersionManager = VersionManager;

// CRITICAL: Make switchTab globally accessible for HTML onclick handlers
window.switchTab = window.App.switchTab;