-- CineShelf Global Database Schema - DreamHost Compatible
CREATE DATABASE IF NOT EXISTS cineshelf_global;
USE cineshelf_global;

-- Global Movies Database (shared metadata)
CREATE TABLE global_movies (
    id INT PRIMARY KEY AUTO_INCREMENT,
    imdb_id VARCHAR(20) UNIQUE,
    tmdb_id VARCHAR(20) UNIQUE,
    title VARCHAR(500) NOT NULL,
    year INT,
    director VARCHAR(300),
    genre VARCHAR(200),
    runtime INT,
    rating DECIMAL(3,1),
    poster_url TEXT,
    plot TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    popularity_score INT DEFAULT 0,
    total_owners INT DEFAULT 0,
    INDEX idx_title (title),
    INDEX idx_year (year),
    INDEX idx_imdb (imdb_id),
    INDEX idx_popularity (popularity_score DESC)
);

-- User Profiles
CREATE TABLE users (
    id VARCHAR(20) PRIMARY KEY,
    display_name VARCHAR(100),
    email VARCHAR(255) UNIQUE,
    privacy_level ENUM('private', 'friends', 'public') DEFAULT 'private',
    show_collection BOOLEAN DEFAULT FALSE,
    allow_borrowing BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    total_movies INT DEFAULT 0,
    INDEX idx_privacy (privacy_level),
    INDEX idx_active (last_active)
);

-- User Collections (individual ownership)
CREATE TABLE user_collections (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id VARCHAR(20) NOT NULL,
    global_movie_id INT NOT NULL,
    format ENUM('DVD', 'Blu-ray', '4K', 'Digital', 'VHS', 'Other') DEFAULT 'DVD',
    condition_rating ENUM('Poor', 'Fair', 'Good', 'Very Good', 'Mint') DEFAULT 'Good',
    purchase_price DECIMAL(8,2),
    purchase_date DATE,
    personal_notes TEXT,
    is_lendable BOOLEAN DEFAULT FALSE,
    current_borrower VARCHAR(20) NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (global_movie_id) REFERENCES global_movies(id) ON DELETE CASCADE,
    FOREIGN KEY (current_borrower) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_user_movie_format (user_id, global_movie_id, format),
    INDEX idx_user (user_id),
    INDEX idx_format (format),
    INDEX idx_lendable (is_lendable)
);

-- Borrowing System
CREATE TABLE borrowing_requests (
    id INT PRIMARY KEY AUTO_INCREMENT,
    collection_item_id INT NOT NULL,
    requester_id VARCHAR(20) NOT NULL,
    owner_id VARCHAR(20) NOT NULL,
    status ENUM('pending', 'approved', 'denied', 'active', 'returned', 'overdue') DEFAULT 'pending',
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP NULL,
    due_date DATE NULL,
    returned_at TIMESTAMP NULL,
    notes TEXT,
    FOREIGN KEY (collection_item_id) REFERENCES user_collections(id) ON DELETE CASCADE,
    FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_requester (requester_id),
    INDEX idx_owner (owner_id),
    INDEX idx_status (status),
    INDEX idx_due_date (due_date)
);

-- User Activity Log
CREATE TABLE user_activity (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id VARCHAR(20) NOT NULL,
    action VARCHAR(50) NOT NULL,
    details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_activity (user_id, created_at),
    INDEX idx_action (action)
);

-- Community Features
CREATE TABLE user_relationships (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id VARCHAR(20) NOT NULL,
    friend_id VARCHAR(20) NOT NULL,
    status ENUM('pending', 'accepted', 'blocked') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_relationship (user_id, friend_id),
    INDEX idx_user_friends (user_id, status)
);

-- Movie Format Popularity View (No triggers needed)
CREATE VIEW movie_popularity AS
SELECT 
    gm.id,
    gm.title,
    gm.year,
    COUNT(uc.id) as owner_count,
    GROUP_CONCAT(DISTINCT uc.format) as available_formats,
    AVG(CASE 
        WHEN uc.condition_rating = 'Poor' THEN 1
        WHEN uc.condition_rating = 'Fair' THEN 2
        WHEN uc.condition_rating = 'Good' THEN 3
        WHEN uc.condition_rating = 'Very Good' THEN 4
        WHEN uc.condition_rating = 'Mint' THEN 5
    END) as avg_condition,
    COUNT(CASE WHEN uc.is_lendable = TRUE THEN 1 END) as lendable_copies
FROM global_movies gm
LEFT JOIN user_collections uc ON gm.id = uc.global_movie_id
GROUP BY gm.id, gm.title, gm.year
ORDER BY owner_count DESC;
