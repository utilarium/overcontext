import { useState, useEffect } from 'react'
import LoadingSpinner from './components/LoadingSpinner'
import ErrorMessage from './components/ErrorMessage'
import MarkdownRenderer from './components/MarkdownRenderer'
import './App.css'

interface DocSection {
    id: string;
    title: string;
    file: string;
    description: string;
}

const DOC_SECTIONS: DocSection[] = [
    {
        id: 'getting-started',
        title: 'Getting Started',
        file: 'getting-started.md',
        description: 'Quick start guide and installation'
    },
    {
        id: 'defining-schemas',
        title: 'Defining Schemas',
        file: 'defining-schemas.md',
        description: 'How to define and register entity schemas'
    },
    {
        id: 'storage-providers',
        title: 'Storage Providers',
        file: 'storage-providers.md',
        description: 'Filesystem, memory, and hierarchical storage'
    },
    {
        id: 'namespaces',
        title: 'Namespaces',
        file: 'namespaces.md',
        description: 'Organize entities across multiple namespaces'
    },
    {
        id: 'building-cli',
        title: 'Building a CLI',
        file: 'building-cli.md',
        description: 'Create command-line tools with overcontext'
    },
    {
        id: 'api-reference',
        title: 'API Reference',
        file: 'api-reference.md',
        description: 'Complete API documentation'
    }
];

function App() {
    const [activeSection, setActiveSection] = useState<string>('getting-started')
    const [content, setContent] = useState<string>('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [sidebarOpen, setSidebarOpen] = useState(false)

    const getLogoPath = (): string => {
        return '/overcontext/overcontext-logo.png'
    }

    const loadSection = async (sectionId: string) => {
        const section = DOC_SECTIONS.find(s => s.id === sectionId)
        if (!section) return

        setLoading(true)
        setError(null)

        try {
            const response = await fetch(`./${section.file}`)
            if (!response.ok) {
                throw new Error(`Failed to fetch ${section.title}: ${response.status}`)
            }
            const text = await response.text()
            setContent(text)
            setActiveSection(sectionId)
            setLoading(false)
            setSidebarOpen(false) // Close sidebar on mobile after selection
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
            setLoading(false)
        }
    }

    useEffect(() => {
        // Load initial section
        loadSection('getting-started')
    }, [])

    if (loading) {
        return (
            <div className="app">
                <div className="loading-container">
                    <LoadingSpinner />
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="app">
                <div className="error-container">
                    <ErrorMessage message={error} />
                </div>
            </div>
        )
    }

    return (
        <div className="app">
            <header className="header">
                <div className="header-content">
                    <div className="header-main">
                        <div className="header-left">
                            <h1>Overcontext</h1>
                            <button
                                className="mobile-menu-button"
                                onClick={() => setSidebarOpen(!sidebarOpen)}
                                aria-label="Toggle menu"
                            >
                                ☰
                            </button>
                        </div>
                        <img src={getLogoPath()} alt="Overcontext logo" className="logo" />
                    </div>
                    <p className="subtitle">Schema-Driven Framework for Context Management</p>
                    <div className="header-links">
                        <a href="https://utilarium.github.io" target="_blank" rel="noopener noreferrer">
                            Utilarium
                        </a>
                        <a href="https://github.com/utilarium/overcontext" target="_blank" rel="noopener noreferrer">
                            GitHub
                        </a>
                        <a href="https://www.npmjs.com/package/@utilarium/overcontext" target="_blank" rel="noopener noreferrer">
                            NPM
                        </a>
                    </div>
                </div>
            </header>

            <div className="main-content">
                <nav className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
                    <div className="sidebar-content">
                        <h2>Documentation</h2>
                        <ul className="nav-list">
                            {DOC_SECTIONS.map((section) => (
                                <li key={section.id}>
                                    <button
                                        className={`nav-item ${activeSection === section.id ? 'active' : ''}`}
                                        onClick={() => loadSection(section.id)}
                                    >
                                        <span className="nav-title">{section.title}</span>
                                        <span className="nav-description">{section.description}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </nav>

                <main className="content">
                    <div className="markdown-container">
                        <MarkdownRenderer content={content} />
                    </div>
                </main>
            </div>

            <footer className="footer">
                <div className="footer-content">
                    <p>
                        Built with ❤️ by{' '}
                        <a href="https://github.com/tobrien" target="_blank" rel="noopener noreferrer">
                            Tim O'Brien
                        </a>
                    </p>
                    <p className="license">Licensed under Apache-2.0</p>
                </div>
            </footer>
        </div>
    )
}

export default App
