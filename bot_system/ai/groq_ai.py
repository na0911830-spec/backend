import logging
from groq import Groq
from bot_system.config import GROQ_API_KEYS, GROQ_MODEL

logger = logging.getLogger(__name__)

def call_groq_ai_agent(messages: list, tools: list = None) -> dict:
    """Calls Groq API using Groq SDK with reasoning parameters and function tool calling support."""
    last_exception = None
    for api_key in GROQ_API_KEYS:
        try:
            client = Groq(api_key=api_key)
            kwargs = {
                "model": GROQ_MODEL,
                "messages": messages,
                "temperature": 1,
                "max_completion_tokens": 2048,
                "top_p": 1,
                "reasoning_effort": "low"
            }
            if tools:
                kwargs["tools"] = tools

            completion = client.chat.completions.create(**kwargs)
            if completion.choices and len(completion.choices) > 0:
                msg = completion.choices[0].message
                tool_calls_raw = getattr(msg, "tool_calls", None)
                tool_calls = []
                if tool_calls_raw:
                    for tc in tool_calls_raw:
                        tool_calls.append({
                            "id": getattr(tc, "id", ""),
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments
                            }
                        })
                return {
                    "content": msg.content or "",
                    "tool_calls": tool_calls
                }
            return {"content": "", "tool_calls": []}
        except Exception as e:
            last_exception = e
            logger.warning(f"Groq API key starting with '{api_key[:8]}...' failed: {e}. Trying next key...")

    logger.error(f"All Groq API keys failed. Last error: {last_exception}")
    return {"content": "", "tool_calls": []}
