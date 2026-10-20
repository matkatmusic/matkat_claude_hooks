---
description: Plan/Spec file creation should focus more on 'How', and less on 'Why', when defining a Plan file for a task.
---

## Another agent may be asked to implement the plan
This 'planning.md' document might have been added into your context via the '/make-a-plan' skill. If so, the session where 'make-a-plan' was used is the session where the implementation will occur, which could mean that you might be the implementing agent, or you might just be in charge of making the plan for the other agent. 

## The content type the plan should contain
The plan file should be mostly instructions and logic, with less focus on the rationale. 
The instructions themselves should be written such that the implementing agent does not need to reason about *how* what is being built *should* be built *for the majority of what is being built*.  
Clear context should be provided as part of the 'How', so that the implementing agent knows *where* to do the work, and not just *how* to do the work.

## What to include/exclude in the Plan file
Plan/Spec files should focus on the 'How' and 'In What Order' of a task.  
- The Planning Agent's job is focused on 'Why' for each item required to complete the task. 
- For each item required to complete the task being planned, the Planning Agent's reasoning and rationalizing has the greatest influence on the shape and detail that go into that item's instructions.

## Intent sentence for each item
Start each item in the plan with one 'Intent:' sentence. The 'Intent:' sentence states the problem that the section is meant to solve.
If a code snippet is long, give the snippet its own 'Intent:' sentence. That sentence states the problem that the snippet is meant to solve.

## Before Presenting the Plan
After drafting a plan, but before the plan is presented to the user for review: 
- Look for sections and statements where there are ambiguities or vagueness.  These sections should be rewritten so that they contain minimal ambiguities.

The user should be able to ask "Why is this instruction written this way" to the Planning Agent, for nearly every line in the plan, and the planning agent should be able to respond with the reasoning and rationalizing for that line. 

## Use Test-driven Development best practices
Read `~/.claude/guides/tdd.md`.
This document defines how plans should be structured so that Test-Driven-Development techniques are used when implementing the plan. 

## Code snippets in plans
If the plan uses code snippets to show how to implement something, the code needs to conform to the requirements defined in `~/.claude/guides/coding-standards.md`.
