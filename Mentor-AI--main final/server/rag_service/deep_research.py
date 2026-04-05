# server/rag_service/deep_research.py
# Enhanced academic search with PubMed integration.
# Registered as a Flask Blueprint in app.py.

import asyncio
import aiohttp
import logging
import xml.etree.ElementTree as ET
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

PUBMED_SEARCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi'
PUBMED_SUMMARY_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi'
PUBMED_FETCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi'


async def search_pubmed(session: aiohttp.ClientSession, query: str, max_results: int = 5) -> List[Dict[str, Any]]:
    """Search PubMed via NCBI E-utilities API (free, no API key required)."""
    logger.info(f"Querying PubMed with: {query}")

    try:
        # Step 1: Search for PubMed IDs
        search_params = {
            'db': 'pubmed',
            'term': query,
            'retmax': max_results,
            'retmode': 'json',
            'sort': 'relevance',
        }
        async with session.get(PUBMED_SEARCH_URL, params=search_params) as response:
            response.raise_for_status()
            search_data = await response.json()

        id_list = search_data.get('esearchresult', {}).get('idlist', [])
        if not id_list:
            logger.info(f"PubMed returned no results for: {query}")
            return []

        # Step 2: Fetch article summaries
        summary_params = {
            'db': 'pubmed',
            'id': ','.join(id_list),
            'retmode': 'json',
        }
        async with session.get(PUBMED_SUMMARY_URL, params=summary_params) as response:
            response.raise_for_status()
            summary_data = await response.json()

        result = summary_data.get('result', {})
        papers = []
        for pmid in id_list:
            article = result.get(pmid, {})
            if not article or 'error' in article:
                continue

            authors = [a.get('name', '') for a in article.get('authors', []) if a.get('name')]
            papers.append({
                'source': 'PubMed',
                'title': article.get('title', 'Untitled'),
                'url': f'https://pubmed.ncbi.nlm.nih.gov/{pmid}/',
                'summary': article.get('title', ''),  # Summary API doesn't return abstracts
                'authors': authors,
                'published': article.get('pubdate', ''),
                'pmid': pmid,
            })

        logger.info(f"Found {len(papers)} results from PubMed.")
        return papers

    except Exception as e:
        logger.warning(f"PubMed search failed: {e}")
        return []


async def fetch_pubmed_abstracts(session: aiohttp.ClientSession, pmids: List[str]) -> Dict[str, str]:
    """Fetch full abstracts for PubMed articles via efetch API."""
    if not pmids:
        return {}

    try:
        params = {
            'db': 'pubmed',
            'id': ','.join(pmids),
            'retmode': 'xml',
            'rettype': 'abstract',
        }
        async with session.get(PUBMED_FETCH_URL, params=params) as response:
            response.raise_for_status()
            xml_text = await response.text()

        # Parse XML to extract abstracts
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError:
            logger.warning("Failed to parse PubMed XML response")
            return {}

        abstracts = {}
        for article in root.findall('.//PubmedArticle'):
            pmid_elem = article.find('.//PMID')
            abstract_elem = article.find('.//Abstract')
            if pmid_elem is not None and abstract_elem is not None:
                pmid = pmid_elem.text
                abstract_texts = []
                for text_elem in abstract_elem.findall('.//AbstractText'):
                    label = text_elem.get('Label', '')
                    text = text_elem.text or ''
                    if label:
                        abstract_texts.append(f"{label}: {text}")
                    else:
                        abstract_texts.append(text)
                abstracts[pmid] = ' '.join(abstract_texts)

        return abstracts

    except Exception as e:
        logger.warning(f"PubMed abstract fetch failed: {e}")
        return {}


async def enhanced_academic_search(query: str, max_results_per_api: int = 5) -> List[Dict[str, Any]]:
    """
    Enhanced academic search combining existing sources + PubMed.
    Wraps academic_search.search_all_apis and adds PubMed.
    """
    from academic_search import search_arxiv, search_semantic_scholar

    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
        tasks = [
            search_arxiv(session, query, max_results=max_results_per_api),
            search_semantic_scholar(session, query, max_results=max_results_per_api),
            search_pubmed(session, query, max_results=max_results_per_api),
        ]

        results_from_tasks = await asyncio.gather(*tasks, return_exceptions=True)

        all_results = []
        api_names = ['ArXiv', 'Semantic Scholar', 'PubMed']
        for i, result in enumerate(results_from_tasks):
            if isinstance(result, Exception):
                logger.warning(f"Could not retrieve results from {api_names[i]}: {result}")
            else:
                all_results.extend(result)
                logger.info(f"Found {len(result)} results from {api_names[i]}.")

        # Enrich PubMed results with abstracts
        pubmed_items = [r for r in all_results if r.get('source') == 'PubMed' and r.get('pmid')]
        if pubmed_items:
            abstracts = await fetch_pubmed_abstracts(session, [r['pmid'] for r in pubmed_items])
            for item in all_results:
                if item.get('pmid') and item['pmid'] in abstracts:
                    item['summary'] = abstracts[item['pmid']]

    # Deduplicate by title
    unique_results = {paper['title'].lower(): paper for paper in all_results if paper.get('title')}.values()
    return list(unique_results)
