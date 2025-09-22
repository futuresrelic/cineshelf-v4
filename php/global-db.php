<?php
require_once 'config.php';

class CineShelfAPI {
    private $pdo;
    
    public function __construct($pdo) {
        $this->pdo = $pdo;
    }
    
    // Initialize or get user
    public function initUser($userData = null) {
        $userId = $_SERVER['HTTP_X_USER_ID'] ?? null;
        
        if (!$userId) {
            $userId = generateUserId();
        }
        
        // Check if user exists
        $stmt = $this->pdo->prepare("SELECT * FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        $user = $stmt->fetch();
        
        if (!$user) {
            // Create new user
            $displayName = $userData['display_name'] ?? 'Movie Collector';
            $stmt = $this->pdo->prepare("INSERT INTO users (id, display_name) VALUES (?, ?)");
            $stmt->execute([$userId, $displayName]);
            
            logActivity($this->pdo, $userId, 'user_created');
        }
        
        return ['user_id' => $userId, 'user' => $user ?: ['id' => $userId, 'display_name' => $displayName]];
    }
    
    // Add movie to global database and user collection
    public function addMovie($userId, $movieData) {
        $this->pdo->beginTransaction();
        
        try {
            // Check if movie exists in global database
            $globalMovieId = $this->findOrCreateGlobalMovie($movieData);
            
            // Add to user collection
            $stmt = $this->pdo->prepare("
                INSERT INTO user_collections 
                (user_id, global_movie_id, format, condition_rating, personal_notes, is_lendable) 
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                condition_rating = VALUES(condition_rating),
                personal_notes = VALUES(personal_notes),
                is_lendable = VALUES(is_lendable),
                updated_at = NOW()
            ");
            
            $stmt->execute([
                $userId,
                $globalMovieId,
                $movieData['format'] ?? 'DVD',
                $movieData['condition'] ?? 'Good',
                $movieData['notes'] ?? '',
                $movieData['lendable'] ?? false
            ]);
            
            $this->pdo->commit();
            logActivity($this->pdo, $userId, 'movie_added', ['movie_id' => $globalMovieId]);
            
            return ['success' => true, 'global_movie_id' => $globalMovieId];
            
        } catch (Exception $e) {
            $this->pdo->rollBack();
            return ['error' => 'Failed to add movie: ' . $e->getMessage()];
        }
    }
    
    private function findOrCreateGlobalMovie($movieData) {
        // Try to find existing movie
        $stmt = $this->pdo->prepare("SELECT id FROM global_movies WHERE imdb_id = ? OR (title = ? AND year = ?)");
        $stmt->execute([$movieData['imdbID'] ?? null, $movieData['Title'], $movieData['Year'] ?? null]);
        $existing = $stmt->fetch();
        
        if ($existing) {
            return $existing['id'];
        }
        
        // Create new global movie entry
        $stmt = $this->pdo->prepare("
            INSERT INTO global_movies 
            (imdb_id, tmdb_id, title, year, director, genre, runtime, rating, poster_url, plot) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        
        $stmt->execute([
            $movieData['imdbID'] ?? null,
            $movieData['tmdbID'] ?? null,
            $movieData['Title'],
            $movieData['Year'] ?? null,
            $movieData['Director'] ?? null,
            $movieData['Genre'] ?? null,
            $movieData['Runtime'] ? intval($movieData['Runtime']) : null,
            $movieData['imdbRating'] ? floatval($movieData['imdbRating']) : null,
            $movieData['Poster'] ?? null,
            $movieData['Plot'] ?? null
        ]);
        
        return $this->pdo->lastInsertId();
    }
    
    // Get user's collection with global movie data
    public function getUserCollection($userId, $page = 1, $limit = 50) {
        $offset = ($page - 1) * $limit;
        
        $stmt = $this->pdo->prepare("
            SELECT 
                uc.*,
                gm.title, gm.year, gm.director, gm.genre, gm.rating, gm.poster_url, gm.total_owners,
                br.status as borrowing_status, br.due_date, borrower.display_name as borrower_name
            FROM user_collections uc
            JOIN global_movies gm ON uc.global_movie_id = gm.id
            LEFT JOIN borrowing_requests br ON uc.id = br.collection_item_id AND br.status = 'active'
            LEFT JOIN users borrower ON br.requester_id = borrower.id
            WHERE uc.user_id = ?
            ORDER BY uc.added_at DESC
            LIMIT ? OFFSET ?
        ");
        
        $stmt->execute([$userId, $limit, $offset]);
        return $stmt->fetchAll();
    }
    
    // Discover movies owned by others
    public function discoverMovies($userId, $search = '', $format = '', $genre = '', $page = 1, $limit = 20) {
        $offset = ($page - 1) * $limit;
        $conditions = ['u.privacy_level != ?'];
        $params = ['private'];
        
        if ($search) {
            $conditions[] = 'gm.title LIKE ?';
            $params[] = "%$search%";
        }
        
        if ($format) {
            $conditions[] = 'uc.format = ?';
            $params[] = $format;
        }
        
        if ($genre) {
            $conditions[] = 'gm.genre LIKE ?';
            $params[] = "%$genre%";
        }
        
        $whereClause = implode(' AND ', $conditions);
        
        $stmt = $this->pdo->prepare("
            SELECT 
                gm.title, gm.year, gm.poster_url, gm.rating, gm.total_owners,
                uc.format, uc.condition_rating, uc.is_lendable,
                u.display_name as owner_name, u.id as owner_id
            FROM user_collections uc
            JOIN global_movies gm ON uc.global_movie_id = gm.id
            JOIN users u ON uc.user_id = u.id
            WHERE $whereClause AND uc.user_id != ? AND u.show_collection = TRUE
            ORDER BY gm.popularity_score DESC, gm.total_owners DESC
            LIMIT ? OFFSET ?
        ");
        
        $params[] = $userId;
        $params[] = $limit;
        $params[] = $offset;
        
        $stmt->execute($params);
        return $stmt->fetchAll();
    }
    
    // Get popular movies across all users
    public function getPopularMovies($limit = 20) {
        $stmt = $this->pdo->prepare("
            SELECT * FROM movie_popularity 
            WHERE owner_count > 1 
            ORDER BY owner_count DESC, avg_condition DESC 
            LIMIT ?
        ");
        $stmt->execute([$limit]);
        return $stmt->fetchAll();
    }
    
    // Create borrowing request
    public function requestBorrow($requesterId, $collectionItemId) {
        // Get collection item details
        $stmt = $this->pdo->prepare("
            SELECT uc.user_id as owner_id, uc.is_lendable, gm.title 
            FROM user_collections uc 
            JOIN global_movies gm ON uc.global_movie_id = gm.id 
            WHERE uc.id = ?
        ");
        $stmt->execute([$collectionItemId]);
        $item = $stmt->fetch();
        
        if (!$item || !$item['is_lendable']) {
            return ['error' => 'Item not available for borrowing'];
        }
        
        $stmt = $this->pdo->prepare("
            INSERT INTO borrowing_requests (collection_item_id, requester_id, owner_id) 
            VALUES (?, ?, ?)
        ");
        $stmt->execute([$collectionItemId, $requesterId, $item['owner_id']]);
        
        logActivity($this->pdo, $requesterId, 'borrow_requested', ['item_id' => $collectionItemId]);
        
        return ['success' => true, 'message' => 'Borrow request sent'];
    }
    
    // Handle API requests
    public function handleRequest() {
        $method = $_SERVER['REQUEST_METHOD'];
        $path = trim($_SERVER['PATH_INFO'] ?? '', '/');
        $pathParts = explode('/', $path);
        
        // Get user context
        $userId = $_SERVER['HTTP_X_USER_ID'] ?? null;
        if (!$userId && $method !== 'POST' || $pathParts[0] !== 'init') {
            return ['error' => 'User ID required'];
        }
        
        switch ($method) {
            case 'GET':
                return $this->handleGet($pathParts, $userId);
            case 'POST':
                return $this->handlePost($pathParts, $userId);
            case 'PUT':
                return $this->handlePut($pathParts, $userId);
            case 'DELETE':
                return $this->handleDelete($pathParts, $userId);
            default:
                return ['error' => 'Method not allowed'];
        }
    }
    
    private function handleGet($pathParts, $userId) {
        switch ($pathParts[0]) {
            case 'collection':
                return $this->getUserCollection($userId, $_GET['page'] ?? 1, $_GET['limit'] ?? 50);
            case 'discover':
                return $this->discoverMovies($userId, $_GET['search'] ?? '', $_GET['format'] ?? '', $_GET['genre'] ?? '');
            case 'popular':
                return $this->getPopularMovies($_GET['limit'] ?? 20);
            default:
                return ['error' => 'Endpoint not found'];
        }
    }
    
    private function handlePost($pathParts, $userId) {
        $data = json_decode(file_get_contents('php://input'), true);
        
        switch ($pathParts[0]) {
            case 'init':
                return $this->initUser($data);
            case 'movies':
                return $this->addMovie($userId, $data);
            case 'borrow':
                return $this->requestBorrow($userId, $data['collection_item_id']);
            default:
                return ['error' => 'Endpoint not found'];
        }
    }
}

// Initialize API
$api = new CineShelfAPI($pdo);
echo json_encode($api->handleRequest());
?>