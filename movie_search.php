<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $title = isset($_GET['title']) ? trim($_GET['title']) : '';
    
    if (!$title) {
        http_response_code(400);
        echo json_encode(['error' => 'Title required']);
        exit;
    }
    
    $movieDb = 'shared_movies.json';
    
    if (file_exists($movieDb)) {
        $movies = json_decode(file_get_contents($movieDb), true);
        if (!$movies) $movies = [];
        
        // Search for movie by title (case-insensitive)
        $searchTitle = strtolower($title);
        foreach ($movies as $movie) {
            if (strtolower($movie['title']) === $searchTitle) {
                echo json_encode($movie);
                exit;
            }
        }
    }
    
    // Movie not found
    http_response_code(404);
    echo json_encode(['error' => 'Movie not found']);
} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}
?>