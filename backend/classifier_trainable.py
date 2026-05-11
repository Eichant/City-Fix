import os
import json
import numpy as np
from pathlib import Path

import tensorflow as tf
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.layers import GlobalAveragePooling2D, Dropout, Dense
from tensorflow.keras.models import Model
from tensorflow.keras.optimizers import Adam

class CityFixClassifier:
    def __init__(self, model_path=None):
        base = Path(__file__).parent
        self.model_path = model_path or (base / 'model' / 'cityfix_model.h5')
        self.classes_path = base / 'model' / 'classes.json'
        self.model = None
        self.class_names = []
        self.mapping = {}
        self.img_size = (224, 224)

    def build_and_train(self, dataset_path, epochs=10, batch_size=16):
        dataset_path = Path(dataset_path)

        datagen = ImageDataGenerator(
            rescale=1./255,
            rotation_range=20,
            width_shift_range=0.1,
            height_shift_range=0.1,
            shear_range=0.1,
            zoom_range=0.1,
            horizontal_flip=True,
            validation_split=0.2
        )

        train_gen = datagen.flow_from_directory(
            dataset_path,
            target_size=self.img_size,
            batch_size=batch_size,
            class_mode='categorical',
            subset='training',
            shuffle=True
        )
        val_gen = datagen.flow_from_directory(
            dataset_path,
            target_size=self.img_size,
            batch_size=batch_size,
            class_mode='categorical',
            subset='validation',
            shuffle=True
        )

        self.class_names = list(train_gen.class_indices.keys())
        num_classes = len(self.class_names)

        self.mapping = {
        'garbage': 'Сміття',
        'graffiti': 'Вандалізм',
        'graffitti': 'Вандалізм',
        'illegal_parking': 'Незаконне паркування',
        'road_damage': 'Дорожні проблеми'
        }

        print(f"Знайдено {num_classes} класів:")
        for name in self.class_names:
            print(f" - {name} -> {self.mapping.get(name, name)}")

        base_model = MobileNetV2(
            weights='imagenet', include_top=False, input_shape=(224,224,3)
        )
        base_model.trainable = False

        inputs = tf.keras.Input(shape=(224,224,3))
        x = base_model(inputs, training=False)
        x = GlobalAveragePooling2D()(x)
        x = Dropout(0.2)(x)
        outputs = Dense(num_classes, activation='softmax')(x)

        self.model = Model(inputs, outputs)
        self.model.compile(
            optimizer=Adam(learning_rate=0.001),
            loss='categorical_crossentropy',
            metrics=['accuracy']
        )

        self.model.fit(
            train_gen,
            steps_per_epoch=max(1, train_gen.samples // batch_size),
            validation_data=val_gen,
            validation_steps=max(1, val_gen.samples // batch_size),
            epochs=epochs,
            verbose=1
        )

        self.save_model()
        return self.model

    def save_model(self):
        os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
        self.model.save(self.model_path)
        with open(self.classes_path, 'w', encoding='utf-8') as f:
            json.dump({
                'class_names': self.class_names,
                'mapping': self.mapping
            }, f, ensure_ascii=False)
        print(f"Модель збережено: {self.model_path}")

    def load_model(self):
        if os.path.exists(self.model_path) and os.path.exists(self.classes_path):
            self.model = tf.keras.models.load_model(self.model_path)
            with open(self.classes_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                self.class_names = data.get('class_names', [])
                self.mapping = data.get('mapping', {})
            return True
        return False

    def predict(self, image_path, threshold=0.73):
        if self.model is None:
            if not self.load_model():
                return {'category': None, 'confidence': 0.0}

        img = tf.keras.utils.load_img(image_path, target_size=self.img_size)
        x = tf.keras.utils.img_to_array(img)
        x = np.expand_dims(x, axis=0) / 255.0

        preds = self.model.predict(x, verbose=0)[0]
        max_idx = np.argmax(preds)
        confidence = float(preds[max_idx])

        if confidence >= threshold and max_idx < len(self.class_names):
            class_code = self.class_names[max_idx].lower()
            # шукаємо співпадіння в self.mapping (ключі у нижньому регістрі)
            category_name = self.mapping.get(class_code)
            if category_name is None:
                # спробуємо знайти хоча б один із варіантів
                for key, val in self.mapping.items():
                    if key.lower() == class_code:
                        category_name = val
                        break
            if category_name is None:
                category_name = class_code
            return {
                'category': category_name,
                'confidence': confidence,
                'class_code': class_code
            }
        return {'category': None, 'confidence': confidence}


_classifier = None

def get_classifier():
    global _classifier
    if _classifier is None:
        _classifier = CityFixClassifier()
        _classifier.load_model()
    return _classifier

def predict_cityfix_category(image_path):
    return get_classifier().predict(image_path)