import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="text-center py-12">
      <h1 className="text-2xl mb-2">Page not found</h1>
      <p className="text-gray-500 mb-4">The timetable you asked for does not exist.</p>
      <p>
        <Link href="/" className="builder-link-btn">
          Back to timetables
        </Link>
      </p>
    </div>
  );
}
