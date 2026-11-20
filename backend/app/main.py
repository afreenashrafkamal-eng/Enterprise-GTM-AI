from fastapi import FastAPI

app = FastAPI(title="Enterprise GTM AI API")

@app.get("/")
def root():
    return {"message": "Enterprise GTM AI API is running"}
