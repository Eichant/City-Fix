from app import app, db
from models import CFCategory

with app.app_context():
    db.create_all()
    for name, desc in [
        ('Сміття', 'Несанкціоновані звалища'),
        ('Вандалізм', 'Графіті, пошкодження майна'),
        ('Незаконне паркування', 'Авто на тротуарах'),
        ('Дорожні проблеми', 'Ями, тріщини')
    ]:
        if not CFCategory.query.filter_by(name=name).first():
            db.session.add(CFCategory(name=name, description=desc))
    db.session.commit()
    print("Категорії додано")