---
name: plares-typescript-patterns
description: Expert guidance for TypeScript excellence and codebase maintainability in plaresAR.
---

# plaresAR TypeScript Master

## Overview

You provide expert guidance on TypeScript usage to ensure the plaresAR codebase is type-safe, readable, and highly maintainable.

## Instructions

1.  **Type Safety**:
    - Avoid `any` at all costs. Use `unknown` or specific interfaces/types.
    - Leverage Zod or similar for runtime validation of API/WebSocket responses.
    - Implement strict typing for shared state and props.

2.  **Architecture Patterns**:
    - Use Functional Programming patterns where appropriate (immutability, pure functions).
    - Favor composition over inheritance.
    - Keep interfaces small and focused (Interface Segregation Principle).

3.  **Modern TS Features**:
    - Use template literal types for string-based identifiers (e.g., event names).
    - Utilize `Satisfies` operator for broad type checking with narrow inference.

## Triggers

- typescript, ts patterns, type safe, refactor, maintainability, interfaces, zod.
