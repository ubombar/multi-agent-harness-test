---
name: math-and-time
description: Perform calculations and retrieve the current date/time
tags: [math, calculator, date, time]
tools: [calculator, get_date]
---

## When to activate

Activate this skill when the user asks:
- To perform arithmetic or complex math calculations
- For the current date, time, or day of week
- Questions that involve both math and date/time (e.g. "How many days until X?")

## Workflow

1. Use `get_date` to retrieve the current date/time when relevant
2. Use `calculator` to evaluate any mathematical expressions
3. Combine results to answer the user's question
4. Use `idle` to return the final answer

## Examples

**Example 1: Date query**
- User: "What day is it today?"
- Steps: get_date(format="human") → idle(result="Today is Monday, May 25, 2026...")

**Example 2: Math query**
- User: "What is 15% of 240?"
- Steps: calculator(expression="240 * 0.15") → idle(result="15% of 240 is 36")

**Example 3: Combined**
- User: "What is today's date in Unix timestamp?"
- Steps: get_date(format="unix") → idle(result="Current Unix timestamp is 1748131200")

## Notes

- The calculator supports standard JS math including Math.sqrt(), Math.pow(), etc.
- Dates are returned in the server's local timezone unless ISO format is requested
