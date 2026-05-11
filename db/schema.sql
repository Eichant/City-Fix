CREATE DATABASE cityfix_db;

\c cityfix_db;

CREATE TABLE cf_categories (       
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE cf_reports (
    id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES cf_categories(id),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    address VARCHAR(255),
    description TEXT,
    photo_filename VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    votes INTEGER DEFAULT 0
);

INSERT INTO cf_categories (name, description) VALUES
('Сміття', 'Несанкціоновані звалища, переповнені баки'),
('Вандалізм', 'Графіті, пошкодження майна'),
('Незаконне паркування', 'Авто на тротуарах, газонах, пішохідних зонах'),
('Дорожні проблеми', 'Ями, тріщини, пошкоджене покриття');