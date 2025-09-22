<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input || !isset($input['imdbID']) || !isset($input['title'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid movie data']);
        exit;
    }
    
    $movieDb = 'shared_movies.json';
    $movies = [];
    
    // Load existing movies
    if (file_exists($movieDb)) {
        $movies = json_decode(file_get_contents($movieDb), true);
        if (!$movies) $movies = [];
    }
    
    // Check if movie already exists
    $exists = false;
    foreach ($movies as $index => $movie) {
        if ($movie['imdbID'] === $input['imdbID']) {
            $movies[$index] = $input; // Update existing
            $exists = true;
            break;
        }
    }
    
    // Add new movie if it doesn't exist
    if (!$exists) {
        $movies[] = $input;
    }
    
    // Save back to file
    if (file_put_contents($movieDb, json_encode($movies, JSON_PRETTY_PRINT))) {
        echo json_encode(['success' => true]);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save movie']);
    }
} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}
?>