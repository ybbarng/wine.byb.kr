// 로그인 폼이 비밀번호가 맞는지 서버에 확인한다.
export async function verifyPassword(password: string): Promise<boolean> {
  const res = await fetch("/api/admin/verify", {
    method: "POST",
    headers: { "x-admin-password": password },
  });
  return res.ok;
}
