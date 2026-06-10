# Use Node.js 20 LTS Alpine image for a lightweight production build
FROM node:20-alpine

# Set working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy the rest of the backend application code
COPY . .

# Expose port 7860
EXPOSE 7860

# Set environmental variable default to port 7860
ENV PORT=7860

# Start the application
CMD ["npm", "start"]
