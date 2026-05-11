from app import app, db
from models import CFReport

with app.app_context():
    count = CFReport.query.delete()
    db.session.commit()
    print(f'Видалено {count} старих скарг')