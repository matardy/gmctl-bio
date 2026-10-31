import type { FC } from 'react';
import type { Lang } from '@/lib/data';
import { ProjectsCard } from './projects-card';
import { ServicesCard } from './services-card';
import { ContactCard } from './contact-card';

export const CARD_SECTIONS = new Set(['projects', 'services', 'contact']);

export const CARD_COMPONENTS: Record<string, FC<{ lang: Lang }>> = {
  projects: ProjectsCard,
  services: ServicesCard,
  contact: ContactCard,
};
