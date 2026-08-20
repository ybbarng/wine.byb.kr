// pm2 프로세스 정의.
// 포트 같은 배포 환경 종속 값은 코드에 적지 않고 서버의 .env 에서 읽는다.
// (server 스크립트가 pm2 start 전에 .env 를 로드해 process.env 로 넘긴다.)
module.exports = {
  apps: [
    {
      name: "wine",
      script: "npm",
      args: "start",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        // .env 에 PORT 가 있으면 그 값을, 없으면 3000 을 쓴다.
        PORT: process.env.PORT || 3000,
      },
    },
  ],
};
