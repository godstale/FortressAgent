use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResultItem {
    pub title: String,
    pub link: String,
    pub snippet: String,
}

pub fn parse_search_html(html: &str) -> Vec<SearchResultItem> {
    let document = scraper::Html::parse_document(html);
    let result_selector = match scraper::Selector::parse(".result, .web-result, tr") {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let title_selector = match scraper::Selector::parse("a.result__a, .result__title a, a.result-link, a[href]") {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let snippet_selector = match scraper::Selector::parse(".result__snippet, .snippet") {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };

    let mut results = Vec::new();

    for element in document.select(&result_selector) {
        let title_elem = element.select(&title_selector).next();
        let snippet_elem = element.select(&snippet_selector).next();

        if let Some(t) = title_elem {
            let title = t.text().collect::<Vec<_>>().join(" ").trim().to_string();
            let link = t.value().attr("href").unwrap_or("").to_string();
            let snippet = snippet_elem
                .map(|s| s.text().collect::<Vec<_>>().join(" ").trim().to_string())
                .unwrap_or_default();

            if !title.is_empty() && !link.is_empty() {
                results.push(SearchResultItem {
                    title,
                    link,
                    snippet,
                });
            }
        }

        if results.len() >= 10 {
            break;
        }
    }

    results
}

#[tauri::command]
pub async fn web_search(query: String) -> Result<Vec<SearchResultItem>, String> {
    let client = match reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(15))
        .build()
    {
        Ok(c) => c,
        Err(_) => return Ok(Vec::new()),
    };

    let encoded_query = urlencoding::encode(&query);
    let url = format!("https://html.duckduckgo.com/html/?q={}", encoded_query);

    let res = match client.get(&url).send().await {
        Ok(r) => r,
        Err(_) => return Ok(Vec::new()),
    };

    let text = match res.text().await {
        Ok(t) => t,
        Err(_) => return Ok(Vec::new()),
    };

    let parsed = parse_search_html(&text);
    Ok(parsed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_search_html_sample() {
        let sample_html = r#"
        <html>
        <body>
            <div class="result">
                <h2 class="result__title">
                    <a class="result__a" href="https://example.com/rust">Rust Programming</a>
                </h2>
                <a class="result__snippet">A language empowering everyone to build reliable and efficient software.</a>
            </div>
            <div class="result">
                <h2 class="result__title">
                    <a class="result__a" href="https://example.com/tauri">Tauri Apps</a>
                </h2>
                <a class="result__snippet">Build smaller, faster, and more secure desktop applications.</a>
            </div>
        </body>
        </html>
        "#;

        let results = parse_search_html(sample_html);
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].title, "Rust Programming");
        assert_eq!(results[0].link, "https://example.com/rust");
        assert!(results[0].snippet.contains("reliable and efficient"));
        assert_eq!(results[1].title, "Tauri Apps");
    }

    #[test]
    fn test_parse_search_html_empty_on_invalid() {
        let results = parse_search_html("<div>No search items here</div>");
        assert_eq!(results.len(), 0);
    }
}

