# SynBio-LLVM: Docker ML Engine
# Contenedor sidecar para inferencia de plegamiento de proteínas

FROM python:3.12-slim

WORKDIR /app

# Instalar dependencias del sistema
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copiar requirements
COPY requirements.txt .

# Instalar dependencias de Python
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código fuente
COPY src/ ./src/
COPY models/ ./models/

# Puerto para API
EXPOSE 8765

# Variables de entorno
ENV SYNBIO_ML_PORT=8765
ENV ONNX_THREADS=4

# Comando de inicio
CMD ["uvicorn", "src.server:app", "--host", "0.0.0.0", "--port", "8765"]
