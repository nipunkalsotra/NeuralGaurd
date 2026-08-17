# dashboard/Dockerfile
# Two-stage build. Previously this shipped `npm run dev` — the unminified
# Vite dev server, complete with its own HMR WebSocket — as if it were a
# production deployment. This now builds the real production bundle and
# serves the static output, with `-s` (SPA fallback) so client-side
# routes like /architecture or /fallbacks resolve correctly on a direct
# load or refresh instead of 404ing.
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Vite inlines import.meta.env.VITE_* at BUILD time, not runtime — setting
# these as container `environment:` vars (as the old Dockerfile implicitly
# assumed by never mentioning it) has no effect on a prebuilt static
# bundle. They must come in as build args instead; docker-compose.yml
# passes them via this service's `build.args`.
ARG VITE_BACKEND_URL
ARG VITE_WS_URL
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}
ENV VITE_WS_URL=${VITE_WS_URL}
RUN npm run build

FROM node:20-slim AS run
WORKDIR /app
RUN npm install -g serve@14
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
