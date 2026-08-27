import requests
import json
import logging
from bot_system.config import CF_ACCOUNT_ID, CF_API_TOKEN, CF_MODEL
from bot_system.db.connection import record_ai_usage

logger = logging.getLogger(__name__)

def call_cloudflare_ai_agent(messages: list, tools: list = None) -> dict:
    """Calls Cloudflare Workers AI with chat messages and function tools."""
    logger.info(f"Calling Cloudflare Workers AI REST API (Model: {CF_MODEL})...")
    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/run/{CF_MODEL}"
    headers = {
        "Authorization": f"Bearer {CF_API_TOKEN}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "messages": messages,
        "temperature": 0.2
    }
    if tools:
        payload["tools"] = tools

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=25)
        response.raise_for_status()
        data = response.json()
        if data.get("success"):
            logger.info("Cloudflare Workers AI REST API request succeeded.")
            # Record successful Cloudflare API request
            record_ai_usage("cloudflare")
            result = data.get("result", {})
            if "choices" in result and len(result["choices"]) > 0:
                msg = result["choices"][0]["message"]
                return {
                    "content": msg.get("content", ""),
                    "tool_calls": msg.get("tool_calls", [])
                }
            elif "response" in result:
                return {
                    "content": result["response"],
                    "tool_calls": []
                }
        logger.error(f"Cloudflare AI returned error: {data}")
        return {"content": "", "tool_calls": []}
    except Exception as e:
        logger.error(f"Failed to call Cloudflare AI REST API: {e}")
        return {"content": "", "tool_calls": []}

def call_cloudflare_ai(prompt: str, system_prompt: str = None) -> str:
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})
    res = call_cloudflare_ai_agent(messages)
    return res.get("content", "")
