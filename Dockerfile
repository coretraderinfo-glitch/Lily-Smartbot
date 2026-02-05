FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
# Force install dev dependencies (typescript) so we can build
RUN npm install --include=dev

COPY . .
RUN npm run build

# Clean up to keep image small (optional)
RUN npm prune --production

CMD ["npm", "start"]
