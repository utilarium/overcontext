# Why Overcontext?

## Context Is King

The world is waking up to the idea that **context is king** when interacting with Large Language Models. The industry is undergoing a fundamental shift -- from *prompt engineering* to *context engineering*. As Andrej Karpathy described it, context engineering is "the delicate art and science of filling the context window with just the right information." Gartner defines it as "designing and structuring the relevant data, workflows and environment so AI systems can understand intent, make better decisions and deliver contextual, enterprise-aligned outputs."

The insight is straightforward: most AI agent failures aren't model failures -- they're context failures. The quality of what an LLM produces depends almost entirely on the quality of what it receives.

## The Markdown Convergence

The ecosystem has responded with an explosion of context file formats, and nearly all of them converge on the same medium: **Markdown**.

| Tool | Context File | Purpose |
|---|---|---|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code/memory) | `CLAUDE.md` | Project-specific instructions and memory |
| [AGENTS.md](https://github.com/agentsmd/agents.md) (Linux Foundation) | `AGENTS.md` | Open standard for agent instructions |
| [Cursor](https://docs.cursor.com/context/rules-for-ai) | `.cursor/rules/*.mdc` | AI behavior rules |
| [GitHub Copilot](https://docs.github.com/en/copilot/customizing-copilot/adding-repository-custom-instructions) | `.github/copilot-instructions.md` | Repository-level instructions |
| [Windsurf](https://docs.codeium.com/windsurf/memories) | `.windsurf/rules/` | Project rules |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `GEMINI.md` | Agent instructions |
| [Continue](https://docs.continue.dev/) | `.continuerules` | AI assistant rules |

Tools like [Repomix](https://github.com/yamadashy/repomix), [files-to-prompt](https://github.com/simonw/files-to-prompt), and [yek](https://github.com/mohsen1/yek) serialize entire codebases into single files for LLM consumption. The [llms.txt](https://llmstxt.org/) standard proposes a Markdown file at `/llms.txt` for websites to provide machine-readable documentation. [ContextPilot](https://github.com/contextpilot-dev/contextpilot) and [Ruler](https://github.com/intellectronica/ruler) exist solely to synchronize context across multiple Markdown-based formats.

Markdown has become the lingua franca of AI context. And for good reason -- it's human-readable, version-controllable, and universally supported.

**But it has limits.**

## Beyond Flat Files

Markdown-based context is essentially prose. It works well for behavioral instructions ("use TypeScript strict mode," "prefer functional patterns"), but it breaks down when you need to manage *entities* -- the people, projects, organizations, and terms that give AI agents real knowledge about the world they operate in.

Consider the problems:

- **No structure**: A Markdown file about your team is just text. You can't query it for "everyone at Acme Corp" or "all active projects."
- **No validation**: Nothing prevents a person entity from missing required fields or containing invalid data.
- **No layering**: If you need workspace-level defaults that project-level context can override, you have to manage that manually.
- **No search**: As your context grows beyond a handful of files, finding the right entity means reading everything -- and so does the AI agent using it, consuming precious context window tokens.
- **No namespaces**: Work context bleeds into personal context. Project A's terminology collides with Project B's.

These aren't hypothetical issues. They're the exact problems that emerged while building [Protokoll](https://github.com/redaksjon/protokoll).

## Origin Story: From Transcription to Framework

Overcontext grew out of [Protokoll](https://github.com/redaksjon/protokoll), an intelligent transcription system that transforms voice memos into organized, context-aware notes. Protokoll uses OpenAI Whisper for transcription and then enhances results with reasoning models -- but the key innovation is its *context system*.

When Protokoll processes a recording, it doesn't just transcribe words. It:

- **Corrects proper names** using phonetic matching against a knowledge base (so "pre a" becomes "Priya")
- **Classifies content** based on what people, projects, and organizations are mentioned
- **Routes transcriptions** to the right directories based on content analysis

All of this depends on maintaining structured context about the user's world: people they interact with, projects they work on, organizations they deal with, and domain-specific terminology. Protokoll stores this as user-editable YAML files -- context you own and control, not locked in some proprietary cloud database.

As Protokoll evolved and other tools under development needed the same context, several things became clear:

1. **Storage wasn't enough** -- we needed a real API for creating, reading, updating, and deleting context entities
2. **Validation mattered** -- invalid context data caused subtle downstream failures
3. **Hierarchy was essential** -- global context needed to be overridable at the project level
4. **Search was critical** -- as the number of entities grew, tools needed to dynamically find relevant context rather than loading everything
5. **Namespaces were inevitable** -- different work contexts needed isolation

What started as a directory of YAML files became a framework. That framework is Overcontext.

## The Broader Landscape

Overcontext occupies a specific position in the context engineering ecosystem. Understanding where it fits requires looking at the full landscape:

### Agent Instruction Files

Files like `CLAUDE.md`, `AGENTS.md`, and `.cursorrules` provide behavioral instructions to AI agents. They tell the agent *how to behave* -- coding style preferences, framework conventions, project architecture guidelines. They're important, but they're not a knowledge base. They don't model entities and they aren't searchable.

### Codebase-to-Prompt Tools

[Repomix](https://github.com/yamadashy/repomix), [files-to-prompt](https://github.com/simonw/files-to-prompt), [yek](https://github.com/mohsen1/yek), [Gitingest](https://gitingest.com/), and [code2prompt](https://github.com/mufeedvh/code2prompt) solve a different problem: getting source code into an LLM's context window efficiently. They serialize, compress, and format codebases for one-shot consumption. They don't manage persistent knowledge about the entities surrounding that code.

### AI Memory Services

Cloud-based memory solutions like [Mem0](https://mem0.ai), [Letta (formerly MemGPT)](https://letta.com), and [Zep](https://getzep.com) provide persistent memory through embeddings, vector stores, and knowledge graphs. They're powerful for conversational memory, but they store knowledge in opaque formats in cloud infrastructure. You can't `git diff` your Mem0 memories, and you can't edit them in a text editor.

MCP-based memory tools like [MCP-NeuralMemory](https://github.com/Hexecu/mcp-neuralmemory) and [MCP Memory Keeper](https://github.com/mkreyman/mcp-memory-keeper) bring persistent memory to coding assistants, but they focus on automatic extraction from conversations rather than explicit, user-curated knowledge bases.

### The Model Context Protocol (MCP)

[MCP](https://modelcontextprotocol.io) -- often called "USB-C for AI" -- is an open standard from Anthropic (now under the Linux Foundation) that standardizes how AI applications connect to external data sources. It provides Resources, Tools, and Prompts as primitives. MCP is a *transport layer* -- it defines how context gets from a source to an AI application, but not how that context is structured, stored, or validated.

### Where Overcontext Fits

Overcontext is none of these things and complements all of them. It's the **structured entity layer** that sits underneath:

- Your **agent instruction files** can reference Overcontext entities instead of hardcoding knowledge
- Your **MCP server** can serve Overcontext entities as Resources and expose search as a Tool
- Your **CLI tools** can query the same context that your AI agents use
- Your **transcription systems** can read and write to the same entity store

The key differentiators:

| Capability | Overcontext |
|---|---|
| **Schema-validated entities** | Define types with Zod; every entity is validated on create and update |
| **Type-safe API** | TypeScript types flow from schema definitions through CRUD and search operations |
| **Hierarchical discovery** | Context at `/workspace/context/` is overridden by `/workspace/project/context/` automatically |
| **Namespace isolation** | Work, personal, and project contexts are kept separate but queryable together |
| **File-based storage** | YAML files in directories you control, version with git, edit in any editor |
| **Dynamic search** | Query and filter entities at runtime instead of dumping everything into a context window |
| **CLI framework** | Build command-line tools on top of your context with built-in formatters |

## The Big Picture

We're at an inflection point in how humans work with AI. The models are increasingly capable, but their output is bounded by their input. Context engineering isn't just a technique -- it's becoming foundational infrastructure.

The trajectory is clear:

1. **Static instructions** (CLAUDE.md, AGENTS.md) tell agents how to behave
2. **Codebase serialization** (Repomix, yek) gives agents access to source code
3. **Protocol standards** (MCP) define how agents connect to external systems
4. **Structured knowledge** (Overcontext) gives agents searchable, validated knowledge about the world they operate in

As agentic systems grow more autonomous -- making decisions, composing workflows, coordinating with other agents -- the ability to dynamically search for and compose the right context at the right time becomes critical. Flat Markdown files won't scale to that world. Opaque cloud memory won't give you the control and transparency you need.

Overcontext provides schema-driven, file-based, hierarchical, searchable context that you own, you control, and you can version alongside your code. It's context engineering infrastructure for the agentic future.

## Get Started

Ready to move beyond flat files? Head to the [Getting Started](./getting-started.md) guide to set up Overcontext in your project.
