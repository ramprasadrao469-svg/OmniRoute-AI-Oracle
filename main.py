# OmniRoute AI: Supply Chain Risk Oracle
# Python Backend Implementation (Requested Export)

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import feedparser
import openai
import os
from dotenv import load_dotenv
import uvicorn

load_dotenv()

app = FastAPI(title="OmniRoute AI: Supply Chain Risk Oracle")

# Configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
openai.api_key = OPENAI_API_KEY

class RiskRequest(BaseModel):
    source_port: str
    destination_port: str

class RiskResponse(BaseModel):
    route: str
    overall_risk_score: int
    primary_threat_category: str
    executive_summary: str
    recommended_action: str

def scrape_maritime_news():
    feeds = [
        "https://gcaptain.com/feed/",
        "https://www.supplychaindive.com/feeds/news/"
    ]
    news_items = []
    for feed_url in feeds:
        feed = feedparser.parse(feed_url)
        for entry in feed.entries[:5]:
            news_items.append(f"Title: {entry.title}\nSummary: {entry.summary}")
    return "\n\n".join(news_items)

@app.get("/api/v1/health")
def health_check():
    return {"status": "healthy"}

@app.post("/api/v1/risk/analyze", response_model=RiskResponse)
async def analyze_risk(request: RiskRequest):
    news_context = scrape_maritime_news()
    route = f"{request.source_port} to {request.destination_port}"
    
    system_prompt = (
        "You are an elite Supply Chain Operations Analyst. "
        "Analyze the provided maritime news headlines and calculate a Disruption Risk Score from 1 to 10 "
        "for the specified shipping route. Output ONLY valid JSON."
    )
    
    user_prompt = f"Analyze risk for route: {route}\n\nNews Context:\n{news_context}"
    
    try:
        # Example using OpenAI (can be swapped for Gemini)
        response = openai.ChatCompletion.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"}
        )
        
        import json
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
