from app import app, db
from models import CFCategory

def init_categories():
    categories = [
        ('garbage', 'Сміття', 'Несанкціоновані звалища, переповнені баки'),
        ('graffiti', 'Вандалізм', 'Графіті, пошкодження майна'),
        ('illegal_parking', 'Незаконне паркування', 'Авто на тротуарах, газонах, пішохідних зонах'),
        ('road_damage', 'Дорожні проблеми', 'Ями, тріщини, пошкоджене покриття')
    ]

    for code, name, desc in categories:
        if not CFCategory.query.filter_by(name=name).first():
            cat = CFCategory(name=name, description=desc)
            db.session.add(cat)
            print(f"Додано категорію: {name}")

    db.session.commit()
    print("Категорії успішно додано")

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        init_categories()