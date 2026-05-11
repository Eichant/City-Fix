import os

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
CITYFIX_UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
CITYFIX_ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
CITYFIX_MAX_CONTENT_LENGTH = 16 * 1024 * 1024

SQLALCHEMY_DATABASE_URI = 'sqlite:///cityfix.db'
SQLALCHEMY_TRACK_MODIFICATIONS = False

CITYFIX_CLASSIFICATION_THRESHOLD = 0.73