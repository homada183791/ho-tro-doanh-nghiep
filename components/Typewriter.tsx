import React from 'react';

interface TypewriterProps {
  content: string;
}

const Typewriter: React.FC<TypewriterProps> = ({ content }) => {
  // Simple parser to detect code blocks ```code```
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="leading-relaxed break-words text-sm md:text-base">
      {parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          // Extract language and code
          const contentWithoutTicks = part.slice(3, -3);
          const firstNewLine = contentWithoutTicks.indexOf('\n');
          const language = firstNewLine !== -1 ? contentWithoutTicks.slice(0, firstNewLine).trim() : 'text';
          const code = firstNewLine !== -1 ? contentWithoutTicks.slice(firstNewLine + 1) : contentWithoutTicks;

          return (
            <div key={index} className="my-4 rounded-lg overflow-hidden border border-gray-700 bg-gray-950">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
                <span className="text-xs font-mono text-gray-400 uppercase">{language || 'code'}</span>
                <button 
                  onClick={() => navigator.clipboard.writeText(code)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Copy
                </button>
              </div>
              <div className="p-4 overflow-x-auto">
                <pre className="font-mono text-sm text-gray-300">
                  <code>{code}</code>
                </pre>
              </div>
            </div>
          );
        }
        
        // Handle inline code `code`
        const inlineParts = part.split(/(`[^`]+`)/g);
        return (
          <span key={index}>
            {inlineParts.map((subPart, subIndex) => {
              if (subPart.startsWith('`') && subPart.endsWith('`')) {
                return (
                  <code key={subIndex} className="bg-gray-700 text-gray-200 px-1.5 py-0.5 rounded text-sm font-mono mx-1">
                    {subPart.slice(1, -1)}
                  </code>
                );
              }
              // Basic paragraph handling
              return subPart.split('\n').map((line, i) => (
                <React.Fragment key={i}>
                  {line}
                  {i < subPart.split('\n').length - 1 && <br />}
                </React.Fragment>
              ));
            })}
          </span>
        );
      })}
    </div>
  );
};

export default Typewriter;