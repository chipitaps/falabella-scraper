import { Actor} from 'apify';
import axios from 'axios';
import fs from 'fs'
import { parse } from 'csv-parse/sync'
import * as cheerio from 'cheerio';

const data = fs.readFileSync('airports.csv', 'utf8');
const records = parse(data, { delimiter: '^', relax_quotes: true });
async function loadRecords(): Promise<string[][]> {
  const data = fs.readFileSync('airports.csv', 'utf8');
  const output: string[][] = parse(data, { delimiter: '^', relax_quotes: true });
  return output;
}

async function getIata(city: string): Promise<string | null> {
  const data = fs.readFileSync('airports.csv', 'utf8');
  const records: any[] = parse(data, { columns: true, delimiter: '^', relax_quotes: true });

  const normalized = city.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const row = records.find((r: any) => {
    const field = r.adm2_name_utf || r.adm1_name_utf || r.name || '';
    return field.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === normalized;
  });

  return row ? row.iata_code || null : null;
}

getIata('cucuta').then(code => console.log('IATA:', code));