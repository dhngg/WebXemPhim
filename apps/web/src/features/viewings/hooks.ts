import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { viewingsApi } from './api';
import type { CreateViewingInput } from './types';

export const viewingKeys = { mine: ['viewings', 'mine'] as const };

export function useMyViewings() {
  return useQuery({ queryKey: viewingKeys.mine, queryFn: () => viewingsApi.listMine() });
}

export function useCreateViewing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateViewingInput) => viewingsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: viewingKeys.mine }),
  });
}

export function useCancelViewing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => viewingsApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: viewingKeys.mine }),
  });
}
