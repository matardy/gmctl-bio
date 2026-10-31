import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CARD_SECTIONS, CARD_COMPONENTS } from './index';

describe('chat cards registry', () => {
  it('exposes the pilot sections', () => {
    expect([...CARD_SECTIONS].sort()).toEqual(['contact', 'projects', 'services']);
    expect(typeof CARD_COMPONENTS.projects).toBe('function');
    expect(typeof CARD_COMPONENTS.services).toBe('function');
    expect(typeof CARD_COMPONENTS.contact).toBe('function');
  });

  it('renders each card with real data', () => {
    const Projects = CARD_COMPONENTS.projects;
    const { unmount: u1 } = render(<Projects lang="en" />);
    expect(screen.getByText(/Sales chatbots on WhatsApp/)).toBeInTheDocument();
    u1();

    const Services = CARD_COMPONENTS.services;
    const { unmount: u2 } = render(<Services lang="en" />);
    expect(screen.getByText(/1:1 AI Career Mentorship/)).toBeInTheDocument();
    expect(screen.getByText('$240')).toBeInTheDocument();
    u2();

    const Contact = CARD_COMPONENTS.contact;
    render(<Contact lang="en" />);
    expect(screen.getByText(/in\/gutembergsmendoza/)).toBeInTheDocument();
  });
});
