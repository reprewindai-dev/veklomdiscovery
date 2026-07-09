FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health', (res) => process.exit(res.statusCode >= 200 && res.statusCode < 300 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["npm", "start"]
