<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input || !isset($input['titles']) || !is_array($input['titles'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid request']);
        exit;
    }
    
    $movieDb = 'shared_movies.json';
    $foundMovies = [];
    
    if (file_exists($movieDb)) {
        $movies = json_decode(file_get_contents($movieDb), true);
        if (!$movies) $movies = [];
        
        // Search for each requested title
        foreach ($input['titles'] as $searchTitle) {
            $searchTitle = strtolower(trim($searchTitle));
            
            foreach ($movies as $movie) {
                if (strtolower($movie['title']) === $searchTitle) {
                    $foundMovies[] = $movie;
                    break; // Found match, move to next title
                }
            }
        }
    }
    
    echo json_encode($foundMovies);
} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}
?>