import type { Metadata } from 'next';
import BuilderViewer from '@/components/builder/BuilderViewer';

export const metadata: Metadata = {
  title: 'Timetable Builder — PolyCC',
  description: 'Build a personal timetable: add missed courses, friends, avoid clashes.',
};

export default function BuilderPage() {
  return <BuilderViewer />;
}
