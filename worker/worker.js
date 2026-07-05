export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

    // ---------- REGISTER ----------
    if (url.pathname === "/register" && request.method === "POST") {
      const { username, password } = await request.json();
      const existing = await env.MY_BUCKET.get(`users/${username}.json`);
      if (existing) {
        return new Response(JSON.stringify({ success: false, error: "Username ရှိပြီးသားပါ" }), { headers, status: 400 });
      }
      const user = { id: crypto.randomUUID(), username, password, created_at: Date.now() };
      await env.MY_BUCKET.put(`users/${username}.json`, JSON.stringify(user));
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    // ---------- LOGIN ----------
    if (url.pathname === "/login" && request.method === "POST") {
      const { username, password } = await request.json();
      const obj = await env.MY_BUCKET.get(`users/${username}.json`);
      if (!obj) return new Response(JSON.stringify({ success: false }), { headers, status: 401 });
      const user = JSON.parse(await obj.text());
      if (user.password !== password) {
        return new Response(JSON.stringify({ success: false }), { headers, status: 401 });
      }
      return new Response(JSON.stringify({ success: true, user: { id: user.id, username: user.username } }), { headers });
    }

    // ---------- CREATE POST ----------
    if (url.pathname === "/post" && request.method === "POST") {
      const formData = await request.formData();
      const userId = formData.get("user_id");
      const username = formData.get("username");
      const type = formData.get("type"); // image / video / text
      const caption = formData.get("caption") || "";
      const file = formData.get("file");

      const postId = crypto.randomUUID();
      let fileKey = null;

      if (file && type !== "text") {
        fileKey = `media/${postId}_${file.name}`;
        await env.MY_BUCKET.put(fileKey, file.stream(), {
          httpMetadata: { contentType: file.type }
        });
      }

      const post = {
        id: postId,
        user_id: userId,
        username,
        type,
        caption,
        file_key: fileKey,
        created_at: Date.now()
      };
      await env.MY_BUCKET.put(`posts/${postId}.json`, JSON.stringify(post));

      // index.json ကို update (feed list အတွက်)
      let index = [];
      const indexObj = await env.MY_BUCKET.get("posts/index.json");
      if (indexObj) index = JSON.parse(await indexObj.text());
      index.unshift(postId); // အသစ်ဆုံးကို ရှေ့ဆုံးထား
      await env.MY_BUCKET.put("posts/index.json", JSON.stringify(index));

      return new Response(JSON.stringify({ success: true, post }), { headers });
    }

    // ---------- LIST POSTS (feed) ----------
    if (url.pathname === "/posts" && request.method === "GET") {
      const filterUser = url.searchParams.get("user_id");
      const indexObj = await env.MY_BUCKET.get("posts/index.json");
      const index = indexObj ? JSON.parse(await indexObj.text()) : [];

      const posts = [];
      for (const postId of index) {
        const obj = await env.MY_BUCKET.get(`posts/${postId}.json`);
        if (!obj) continue;
        const post = JSON.parse(await obj.text());
        if (filterUser && post.user_id !== filterUser) continue;
        posts.push(post);
      }
      return new Response(JSON.stringify(posts), { headers });
    }

    // ---------- SERVE FILE (image/video) ----------
    if (url.pathname.startsWith("/file/") && request.method === "GET") {
      const key = decodeURIComponent(url.pathname.replace("/file/", ""));
      const object = await env.MY_BUCKET.get(key);
      if (!object) return new Response("Not found", { status: 404 });
      return new Response(object.body, {
        headers: { "Content-Type": object.httpMetadata?.contentType || "application/octet-stream" }
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers });
  }
};
