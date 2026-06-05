export default function PageHeader({ title, description, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-6 sm:mb-8">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-gray-900 truncate">{title}</h1>
        {description && (
          <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-gray-500 truncate">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2 sm:gap-3 flex-wrap">{children}</div>}
    </div>
  );
}
