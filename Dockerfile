# Use an official lightweight Python image.
FROM python:3.11-slim

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container
COPY requirements.txt .

# Install dependencies specified in requirements.txt
# Use --no-cache-dir to reduce image size
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code into the container
COPY . .

# Expose the port Gunicorn will run on (Render/Heroku often default to PORT env var)
# Cloud Run automatically provides the PORT environment variable
# EXPOSE 8080 # Not strictly needed as Cloud Run injects PORT

# Command to run the application using Gunicorn
# Use the PORT environment variable provided by Cloud Run/Render
# Use 0.0.0.0 to listen on all interfaces
# Use the shell form of CMD to allow shell processing of $PORT
CMD gunicorn --bind 0.0.0.0:$PORT app:app
