# OmniRoute AI: Predictive Maritime Supply Chain Oracle

## 📌 Executive Summary

OmniRoute AI is a predictive logistics tool designed to mitigate global supply chain disruptions. Traditional shipping dashboards track vessels *after* they are delayed. OmniRoute uses Generative AI to analyze live maritime geopolitical and weather data, assigning a predictive **Disruption Risk Score (1-10)** to specific oceanic corridors before ships even leave the port.

**Target Use Case:** Optimizing the semiconductor export corridor between the Port of Visakhapatnam (India) and the Port of Kaohsiung (Taiwan).

## ⚙️ Systems Architecture

This project utilizes a decoupled, microservices-based architecture:

*   **Data Ingestion:** Asynchronous RSS parsing of global maritime intelligence feeds (e.g., gCaptain, Supply Chain Dive).
*   **AI Processing:** RESTful FastAPI backend utilizing Large Language Models for unstructured text evaluation and strict JSON schema generation.
*   **Data Persistence:** NoSQL database (Google Firestore) for saving historical route analyses and caching LLM responses to reduce API latency.
*   **Frontend Client:** React.js dashboard utilizing Leaflet mapping for spatial route visualization.

## 🚀 Core API Endpoints

The core risk evaluation is handled via a low-latency POST route.
`POST /api/v1/risk/analyze`

**Request Payload:**
{
  "source_port": "Visakhapatnam",
  "destination_port": "Kaohsiung"
}

**AI-Generated JSON Response:**
{
  "route": "Visakhapatnam to Kaohsiung",
  "overall_risk_score": 7,
  "primary_threat_category": "Geopolitical / Weather",
  "executive_summary": "Typhoon warnings in the South China Sea combined with port congestion in transshipment hubs indicate a high probability of delays.",
  "recommended_action": "Reroute to alternative port or increase buffer stock for pending semiconductor shipments."
}
