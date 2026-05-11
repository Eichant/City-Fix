import os
import uuid
import json
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from config import (
    CITYFIX_UPLOAD_FOLDER, CITYFIX_ALLOWED_EXTENSIONS, CITYFIX_MAX_CONTENT_LENGTH,
    SQLALCHEMY_DATABASE_URI, SQLALCHEMY_TRACK_MODIFICATIONS,
    CITYFIX_CLASSIFICATION_THRESHOLD
)
from models import db, CFCategory, CFReport
from classifier_trainable import predict_cityfix_category
from datetime import datetime, timedelta

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)

app.config['UPLOAD_FOLDER'] = CITYFIX_UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = CITYFIX_MAX_CONTENT_LENGTH
app.config['SQLALCHEMY_DATABASE_URI'] = SQLALCHEMY_DATABASE_URI
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = SQLALCHEMY_TRACK_MODIFICATIONS

db.init_app(app)
os.makedirs(CITYFIX_UPLOAD_FOLDER, exist_ok=True)


def cityfix_allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in CITYFIX_ALLOWED_EXTENSIONS

@app.route('/')
def serve_cityfix_frontend():
    return app.send_static_file('index.html')

@app.route('/api/cityfix/categories', methods=['GET'])
def get_cityfix_categories():
    categories = CFCategory.query.all()
    return jsonify([{'id': c.id, 'name': c.name} for c in categories])

@app.route('/api/cityfix/reports', methods=['GET'])
def get_cityfix_reports():
    show_resolved = request.args.get('show_resolved', '0') == '1'
    query = CFReport.query.order_by(CFReport.created_at.desc())
    if not show_resolved:
        query = query.filter(CFReport.status != 'resolved')
    reports = query.all()
    result = []
    for r in reports:
        photos = []
        if r.photo_filename:
            try:
                photos = json.loads(r.photo_filename)
            except:
                photos = [r.photo_filename] if r.photo_filename else []
        photo_url = f'/cityfix_uploads/{photos[0]}' if photos else None
        result.append({
            'id': r.id,
            'category_id': r.category_id,
            'category_name': r.category.name if r.category else '',
            'latitude': r.latitude,
            'longitude': r.longitude,
            'address': r.address,
            'description': r.description,
            'photo_url': photo_url,
            'photos': photos,
            'status': r.status,
            'created_at': r.created_at.isoformat(),
            'votes': r.votes
        })
    return jsonify(result)

@app.route('/api/cityfix/reports', methods=['POST'])
def create_cityfix_report():
    category_ids_str = request.form.get('category_ids', '')
    category_ids = [int(x) for x in category_ids_str.split(',') if x.strip().isdigit()]
    latitude = request.form.get('latitude')
    longitude = request.form.get('longitude')
    address = request.form.get('address', '')
    description = request.form.get('description', '')
    files = request.files.getlist('photos')

    if not (category_ids and latitude and longitude and description):
        return jsonify({'error': 'Missing required fields'}), 400

    try:
        latitude = float(latitude)
        longitude = float(longitude)
    except ValueError:
        return jsonify({'error': 'Invalid coordinates'}), 400

    main_category_id = category_ids[0]
    photo_filenames = []

    for file in files:
        if file and cityfix_allowed_file(file.filename):
            ext = file.filename.rsplit('.', 1)[1].lower()
            filename = f"cityfix_{uuid.uuid4().hex}.{ext}"
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(file_path)
            photo_filenames.append(filename)
            if len(photo_filenames) == 1:
                try:
                    pred = predict_cityfix_category(file_path)
                    if pred['confidence'] >= CITYFIX_CLASSIFICATION_THRESHOLD and pred['category']:
                        cat = CFCategory.query.filter_by(name=pred['category']).first()
                        if cat:
                            main_category_id = cat.id
                except:
                    pass

    report = CFReport(
        category_id=main_category_id,
        latitude=latitude,
        longitude=longitude,
        address=address,
        description=description,
        photo_filename=json.dumps(photo_filenames) if photo_filenames else None,
        status='pending'
    )
    db.session.add(report)
    db.session.commit()
    return jsonify({'message': 'City Fix report created', 'id': report.id}), 201

@app.route('/api/cityfix/classify', methods=['POST'])
def classify_photo():
    file = request.files.get('photo')
    if not file:
        return jsonify({'error': 'No photo'}), 400
    ext = file.filename.rsplit('.', 1)[1].lower()
    filename = f"classify_{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)
    try:
        pred = predict_cityfix_category(filepath)
    except Exception as e:
        pred = {'category': None, 'confidence': 0.0}
    try:
        os.remove(filepath)
    except:
        pass
    return jsonify(pred)

@app.route('/api/cityfix/classify-batch', methods=['POST'])
def classify_batch():
    files = request.files.getlist('photos')
    if not files:
        return jsonify({'error': 'No photos'}), 400

    best_category = None
    best_confidence = 0.0
    for file in files:
        if cityfix_allowed_file(file.filename):
            ext = file.filename.rsplit('.', 1)[1].lower()
            filename = f"cls_{uuid.uuid4().hex}.{ext}"
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)
            try:
                pred = predict_cityfix_category(filepath)
                if pred['confidence'] > best_confidence:
                    best_confidence = pred['confidence']
                    best_category = pred['category']
            except:
                pass
            finally:
                try:
                    os.remove(filepath)
                except:
                    pass

    return jsonify({'category': best_category, 'confidence': best_confidence})

@app.route('/api/cityfix/reports/<int:report_id>/status', methods=['PUT'])
def update_report_status(report_id):
    data = request.get_json()
    new_status = data.get('status')
    if new_status not in ['pending', 'in_progress', 'resolved']:
        return jsonify({'error': 'Invalid status'}), 400
    report = CFReport.query.get(report_id)
    if not report:
        return jsonify({'error': 'Report not found'}), 404
    report.status = new_status
    report.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'message': 'Status updated', 'status': report.status})

@app.route('/api/cityfix/statistics', methods=['GET'])
def get_cityfix_statistics():
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)
    reports_last_week = CFReport.query.filter(CFReport.created_at >= week_ago).count()
    resolved_last_month = CFReport.query.filter(
        CFReport.status == 'resolved',
        CFReport.updated_at >= month_ago
    ).count()
    popular = CFReport.query.filter(CFReport.status != 'resolved').order_by(CFReport.votes.desc(), CFReport.created_at.desc()).limit(5).all()
    popular_list = []
    for r in popular:
        popular_list.append({
            'id': r.id,
            'description': (r.description[:100] + '...') if r.description and len(r.description) > 100 else (r.description or ''),
            'address': r.address,
            'votes': r.votes,
            'category': r.category.name if r.category else ''
        })
    return jsonify({
        'reports_last_week': reports_last_week,
        'resolved_last_month': resolved_last_month,
        'popular_reports': popular_list
    })

@app.route('/cityfix_uploads/<filename>')
def cityfix_uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, port=5000)