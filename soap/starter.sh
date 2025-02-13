#!/bin/bash

# Si la variable d'environnement PORT est définie, utilise-la, sinon utilise le port 80
PORT=${PORT:-80}

# Démarre l'application Gunicorn avec le bon port
#!/bin/bash
gunicorn -w 4 -b 0.0.0.0:$PORT app:app
