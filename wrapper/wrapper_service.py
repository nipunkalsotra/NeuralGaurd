from fastapi import FastAPI
app = FastAPI()

@app.get("/v1/status")
def status():
    return {"status": "ok", "mode": "mock"}