FROM node:20-alpine

WORKDIR /app
COPY package.json ./
COPY server.js ./

ENV NODE_ENV=production
EXPOSE 8787

CMD ["npm", "start"]
