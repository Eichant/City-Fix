from app import app, db
from models import CFCategory

with app.app_context():
    CFCategory.query.delete()
    db.session.commit()
    print("Старі категорії видалено")

    categories = [
        ('garbage', 'Сміття', 'Несанкціоновані звалища, переповнені баки'),
        ('graffiti', 'Вандалізм', 'Графіті, пошкодження майна'),
        ('illegal_parking', 'Незаконне паркування', 'Авто на тротуарах, газонах'),
        ('road_damage', 'Дорожні проблеми', 'Ями, тріщини, пошкоджене покриття')
    ]

    for code, name, desc in categories:
        cat = CFCategory(name=name, description=desc)
        db.session.add(cat)

    db.session.commit()
    print("Нові категорії додано")

    for cat in CFCategory.query.all():
        print(f"  {cat.id}: {cat.name}")