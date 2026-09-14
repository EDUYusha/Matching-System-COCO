'use client';

import type { ReactNode } from 'react';
import { CrudPage } from '@/components/admin/CrudPage';

/** ServiceMessages#index — the same CRUD screen, reached from the main nav. */
export function ServiceMessagesPage(): ReactNode {
  return <CrudPage resourceOverride="service_messages" />;
}
