interface ErrorMessageProps {
    message: string
}

const ErrorMessage = ({ message }: ErrorMessageProps) => (
    <div className="error">
        <h2>Failed to load documentation</h2>
        <p>{message}</p>
        <p>
            Please visit{' '}
            <a href="https://github.com/utilarium/overcontext" target="_blank" rel="noopener noreferrer">
                GitHub
            </a>{' '}
            for the latest documentation.
        </p>
    </div>
)

export default ErrorMessage
