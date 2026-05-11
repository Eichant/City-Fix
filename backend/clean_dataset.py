from PIL import Image
from pathlib import Path
import os

def clean_dataset(dataset_dir='dataset'):
    base = Path(dataset_dir)
    removed = 0
    for folder in base.iterdir():
        if folder.is_dir():
            print(f"Перевіряю {folder.name}...")
            for img_file in folder.glob('*'):
                if img_file.suffix.lower() in ['.jpg', '.jpeg', '.png', '.gif', '.bmp']:
                    try:
                        with Image.open(img_file) as img:
                            img.verify()
                    except Exception:
                        print(f"  Видалено пошкоджений файл: {img_file.name}")
                        os.remove(img_file)
                        removed += 1
    print(f"\nВидалено {removed} пошкоджених зображень")

if __name__ == '__main__':
    clean_dataset()