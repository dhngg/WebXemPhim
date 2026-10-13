import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from './api';
import type { LoginInput, RegisterInput, UpdateProfileInput } from './types';

export const authKeys = { me: ['auth', 'me'] as const };

export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: () => authApi.me(),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: (user) => {
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' && q.queryKey[0] !== 'rooms' });
      qc.setQueryData(authKeys.me, user);
    },
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) => authApi.register(input),
    onSuccess: (user) => qc.setQueryData(authKeys.me, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => {
      qc.clear();
      qc.setQueryData(authKeys.me, null);
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => authApi.updateProfile(input),
    onSuccess: (user) => qc.setQueryData(authKeys.me, user),
  });
}

export function useRequestPasswordReset() {
  return useMutation({ mutationFn: (email: string) => authApi.requestPasswordReset(email) });
}
