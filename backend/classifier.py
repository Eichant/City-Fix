import tensorflow as tf
import numpy as np
import os

CITYFIX_MODEL_PATH = os.path.join(os.path.dirname(__file__), 'model', 'cityfix_model.h5')
cityfix_model = None

def load_cityfix_model():
    global cityfix_model
    if cityfix_model is None:
        cityfix_model = tf.keras.applications.MobileNetV2(
            weights='imagenet',
            include_top=True,
            input_shape=(224, 224, 3)
        )
    return cityfix_model

CITYFIX_IMAGENET_MAP = {
    'pothole': 'Дорожні проблеми',
    'manhole': 'Дорожні проблеми',
    'garbage': 'Сміття',
    'graffiti': 'Вандалізм',
    'street_sign': 'Інфраструктура',
    'traffic_light': 'Інфраструктура'
}

def map_imagenet_to_cityfix(imagenet_label):
    for key, urban_cat in CITYFIX_IMAGENET_MAP.items():
        if key in imagenet_label.lower():
            return urban_cat
    return None

def predict_cityfix_category(image_path):
    model = load_cityfix_model()
    
    img = tf.keras.utils.load_img(image_path, target_size=(224, 224))
    x = tf.keras.utils.img_to_array(img)
    x = np.expand_dims(x, axis=0)
    x = tf.keras.applications.mobilenet_v2.preprocess_input(x)

    preds = model.predict(x, verbose=0)
    decoded = tf.keras.applications.mobilenet_v2.decode_predictions(preds, top=3)[0]

    best_match = None
    highest_confidence = 0.0
    for _, label, conf in decoded:
        urban_cat = map_imagenet_to_cityfix(label)
        if urban_cat and conf > highest_confidence:
            highest_confidence = conf
            best_match = urban_cat

    if best_match is None:
        return {'category': None, 'confidence': 0.0}
    
    return {
        'category': best_match, 
        'confidence': float(highest_confidence)
    }